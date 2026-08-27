# Should files be stored in MongoDB or object storage

## 1. The Real-World Problem — When You Actually Hit This

Your MERN app launched last month and everything worked fine. Users could upload profile pictures and documents. You stored the files directly in MongoDB using base64 encoding because it was simple — no extra service to configure, no API keys to manage, just another field in your user document.

Then last week, a user tried to upload a 20MB video as part of their portfolio. The upload failed with a cryptic error. You checked the logs and saw MongoDB complaining about document size limits. You looked up the limit: 16MB per document. The video exceeded it.

You considered switching to GridFS, MongoDB's built-in file storage system. But then you looked at your hosting bill. MongoDB Atlas charges per GB for storage, and you're already paying for the database. Meanwhile, AWS S3 charges a fraction of that per GB and includes a CDN for fast delivery worldwide.

Then you noticed another problem: when users view their profile, the avatar loads slowly because MongoDB isn't optimized for serving binary data over HTTP. Your competitor's app, which uses S3, loads images instantly because they're served through CloudFront edge caches.

This is the moment you realize: MongoDB is for structured data and relationships. Files belong in object storage. MongoDB should only hold the file's address, not the file itself.

## 2. The Analogy — Make the Mechanic Obvious

Think of it like a hotel with a valet parking service.

MongoDB is the valet desk. When you check in, the valet takes your car keys and gives you a ticket with a number. The valet desk doesn't actually store your car — it just keeps track of where your car is parked. The ticket number is like a URL: it tells you where to find your car, but the car itself is somewhere else.

Object storage (S3, Cloudinary, Google Cloud Storage) is the parking garage. The garage actually stores the cars. It's designed specifically for storing vehicles efficiently, with wide lanes, clear markings, and systems to retrieve cars quickly. The garage doesn't care about your hotel reservation details — it just cares about storing and retrieving cars.

When you want your car, you go to the valet desk, show your ticket, and the valet calls the garage to bring your car around. The valet desk handles the logic (who owns this car, is this ticket valid, do they owe parking fees) while the garage handles the storage (where is the car physically parked).

In your app, MongoDB is the valet desk — it stores metadata about files (who uploaded it, when, what type it is) and the URL (the ticket). Object storage is the garage — it actually stores the file bytes. When a user requests a file, your backend checks MongoDB for the URL, then serves that URL to the frontend.

You wouldn't park a thousand cars at the valet desk. You wouldn't store thousands of files in MongoDB.

## 3. The Full Explanation — How It Actually Works

MongoDB has a hard 16MB limit per document. This limit exists because MongoDB is designed for structured data that fits in memory and can be quickly indexed and queried. When you store a file as base64 in a document, you're blowing up the document size and slowing down every query that touches it. MongoDB has to read the entire document into memory, including your file data, even if you only need the user's name.

Object storage services like AWS S3, Cloudinary, and Google Cloud Storage are built specifically for files. They store binary data efficiently, stream it over HTTP, integrate with CDNs for global caching, and charge far less per GB than MongoDB. They also provide features MongoDB doesn't: automatic image resizing, format conversion, lifecycle policies (delete old files automatically), and presigned URLs for temporary access.

The standard pattern for MERN apps is: upload the file to object storage, get back a URL, store that URL in MongoDB along with metadata (original filename, size, MIME type, uploader ID). When you need to display the file, read the URL from MongoDB and use it directly in an `<img>` tag or `<a>` tag.

GridFS is MongoDB's workaround for the 16MB limit. It splits large files into 255KB chunks and stores them across two collections: `fs.files` (metadata) and `fs.chunks` (binary data). But GridFS is still MongoDB — it doesn't have CDN integration, it's more expensive per GB, and it's slower for serving files. Use GridFS only when you need the file to be part of a database transaction (atomic update of a document and its file together) or when you're in an air-gapped environment with no access to cloud storage.

For storage provider selection: S3 is the cheapest raw storage but requires you to build your own image processing and CDN (usually CloudFront). Cloudinary is more expensive but gives you storage, CDN, and image transformations in one API. Cloudflare R2 is S3-compatible with no egress fees, which matters if you're serving lots of downloads. Firebase Storage integrates tightly with Firebase Auth if you're already in that ecosystem.

For access control: public files (avatars, product images) can be stored with public read access and accessed directly via URL. Private files (user documents, sensitive uploads) should be stored with no public access. Instead, your backend generates a presigned URL — a temporary URL that grants access for a short time (usually 1 hour) after verifying the user has permission. The presigned URL includes a signature that proves it was generated by someone with AWS credentials, so even if an attacker intercepts it, it expires quickly.

## 4. See It In Practice — Real Code or Queries

**MongoDB schema for file metadata:**

```javascript
const fileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // fast lookups by user
  },
  url: {
    type: String,
    required: true
  },
  storageKey: {
    type: String,
    required: true // the S3 key or Cloudinary publicId for deletion/transforms
  },
  originalName: {
    type: String,
    required: true // display to user, helps with recognition
  },
  mimeType: {
    type: String,
    required: true // 'image/jpeg', 'application/pdf', etc.
  },
  size: {
    type: Number,
    required: true // in bytes, for quota enforcement
  },
  isPublic: {
    type: Boolean,
    default: false // whether file is publicly accessible
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const File = mongoose.model('File', fileSchema);
```

**Embedded avatar in user schema (for frequently accessed profile images):**

```javascript
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  avatar: {
    url: String,
    storageKey: String, // Cloudinary publicId or S3 key
    uploadedAt: Date
  }
  // ... other user fields
});
```

**Uploading to S3 and storing metadata in MongoDB:**

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const File = require('./models/File');

async function uploadFile(userId, fileBuffer, originalName, mimeType) {
  // Generate a unique key to avoid overwrites
  const storageKey = `${userId}/${Date.now()}-${originalName}`;

  // Upload to S3
  const uploadResult = await s3.putObject({
    Bucket: process.env.S3_BUCKET,
    Key: storageKey,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'private' // default to private, make public explicitly if needed
  }).promise();

  // Store metadata in MongoDB
  const fileRecord = await File.create({
    userId,
    url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${storageKey}`,
    storageKey,
    originalName,
    mimeType,
    size: fileBuffer.length,
    isPublic: false
  });

  return fileRecord;
}
```

**Generating a presigned URL for private file access:**

```javascript
async function getPrivateFileUrl(userId, fileId) {
  // Verify user owns this file
  const file = await File.findOne({ _id: fileId, userId });
  if (!file) {
    throw new Error('File not found or access denied');
  }

  // Generate presigned URL valid for 1 hour
  const url = await s3.getSignedUrlPromise('getObject', {
    Bucket: process.env.S3_BUCKET,
    Key: file.storageKey,
    Expires: 3600 // 1 hour in seconds
  });

  return url;
}
```

**Deleting a file (must delete from both S3 and MongoDB):**

```javascript
async function deleteFile(userId, fileId) {
  const file = await File.findOne({ _id: fileId, userId });
  if (!file) {
    throw new Error('File not found or access denied');
  }

  // Delete from S3
  await s3.deleteObject({
    Bucket: process.env.S3_BUCKET,
    Key: file.storageKey
  }).promise();

  // Delete metadata from MongoDB
  await File.deleteOne({ _id: fileId });
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Should files be stored in MongoDB or object storage?**

Store files in object storage (S3, Cloudinary, Google Cloud Storage) and only store the URL in MongoDB. MongoDB has a 16MB document limit, so any file larger than that will fail. Even for smaller files, storing binary data in MongoDB bloats documents, slows down queries, and is more expensive per GB. Object storage is optimized for serving files, includes CDN integration for fast global delivery, and costs significantly less. MongoDB's role is to store metadata (who uploaded the file, when, what type) and the URL reference. Use GridFS only in specific cases where files need to participate in database transactions or when you're in an environment without access to cloud storage.

**Q: What is GridFS and when should you use it?**

GridFS is MongoDB's specification for storing files larger than 16MB. It automatically splits files into 255KB chunks and stores them across two collections: `fs.files` holds metadata (filename, size, upload date) and `fs.chunks` holds the binary data. Use GridFS when: (1) the file must be updated atomically with other document changes in a single transaction, (2) you're in an air-gapped environment with no access to external cloud storage, or (3) you need to keep files and metadata in the same database for backup/restore simplicity. Don't use GridFS as a general file storage solution — it lacks CDN integration, is more expensive, and is slower for serving files than object storage.

**Q: How do you choose between S3, Cloudinary, and other storage providers?**

Choose based on your team's expertise and feature needs. S3 is the cheapest raw storage but requires you to build image processing separately (usually with Lambda or a separate service) and add CloudFront for CDN. Cloudinary is more expensive but provides storage, CDN, and image transformations (resize, crop, format conversion) in a single API, which saves significant development time for image-heavy apps. Cloudflare R2 is S3-compatible with no egress fees, making it ideal for high-traffic apps that serve lots of downloads. Firebase Storage integrates seamlessly with Firebase Auth if you're already using that ecosystem. For most MERN projects starting out, Cloudinary's ease of use and built-in features justify the higher cost until scale makes S3 + CloudFront more economical.

**Q: What metadata should you store for files in MongoDB?**

Store the URL, the storage key (S3 key or Cloudinary publicId), original filename, MIME type, file size, uploader ID, upload timestamp, and a public/private flag. The URL is for serving the file. The storage key is critical for deletion and transformations. The original filename helps users recognize their files. The MIME type lets you validate file types and set correct Content-Type headers. The size helps enforce upload quotas. The uploader ID enables access control and querying by user. The public/private flag determines access strategy. For user avatars that are accessed frequently, consider embedding this metadata directly in the user schema to avoid an extra query.

**Q: How do you handle file access control for private vs public files?**

For public files (avatars, product images, public documents), store them with public read ACL in object storage and access them directly via URL. For private files (user documents, sensitive uploads), store them with no public access. When a user requests a private file, your backend first verifies they have permission (check if they own it or have been granted access), then generates a presigned URL. A presigned URL is a temporary URL signed with your AWS credentials that grants access for a short time (typically 1 hour). Even if the URL is leaked or intercepted, it expires quickly. Always default to private access on upload and explicitly make files public only when there's a legitimate reason.

**Q: What happens if a user uploads a malicious file?**

Validate file type on upload by checking the MIME type from the file's magic bytes, not just the file extension. Use a library like `file-type` in Node.js to detect the actual file type. Reject executables, scripts, and files that don't match your allowed types. For images, use a library like Sharp to re-encode the image, which strips any malicious metadata or embedded scripts. Scan files with antivirus software if your app handles document uploads in a sensitive context. Never execute uploaded files on your server. Serve files with correct Content-Type headers to prevent browsers from interpreting them as HTML or JavaScript.

## 6. The Traps — What Goes Wrong in Production

**Storing files as base64 in MongoDB documents.** This bloats your documents, slows down every query that touches them, and hits the 16MB limit quickly. It also makes your database backups unnecessarily large. The moment you have more than a few hundred users with profile pictures, your database performance degrades.

**Using GridFS as the default file storage.** GridFS seems convenient because it's built into MongoDB, but it's a specialized tool for specific use cases. You lose CDN integration, pay more per GB, and get slower file serving. Only use GridFS when you genuinely need database transactions with files or have no cloud storage access.

**Forgetting to delete files from object storage when deleting from MongoDB.** If you delete the metadata record but leave the file in S3, you accumulate orphaned files that you're paying for but can't access. Always delete from both places in a transaction-like operation (delete from S3 first, then from MongoDB; if S3 fails, don't delete from MongoDB).

**Making private files publicly accessible.** It's easy to accidentally set the wrong ACL on upload or configure your bucket to be public by default. This exposes sensitive user data. Always default to private ACLs and explicitly make files public only when needed. Audit your bucket permissions regularly.

**Storing only the URL without metadata.** If you only store the URL, you can't query files by user, filter by type, enforce size quotas, or display meaningful filenames to users. You also lose the storage key needed to delete or transform files. Always store at minimum: URL, storage key, original name, MIME type, size, uploader ID, and timestamp.

**Not validating file types properly.** Checking only the file extension is trivial to bypass — an attacker can rename `malicious.exe` to `malicious.jpg`. Always detect the actual MIME type from the file's magic bytes using a library like `file-type`. For images, re-encode them with Sharp to strip any embedded payloads.

**Serving files with wrong Content-Type headers.** If you serve a file without setting the correct Content-Type, browsers may try to execute it as HTML or JavaScript instead of displaying or downloading it. This is a security vulnerability. Object storage usually handles this correctly if you set the ContentType on upload, but verify it in your API responses if you proxy files through your backend.

**Not implementing presigned URL expiration.** If you generate permanent URLs for private files instead of expiring presigned URLs, anyone who gets the URL can access the file forever. Set a short expiration (1 hour or less) and require users to request a new URL each time they need access.

## 7. Compare With Related Concepts

**MongoDB GridFS vs Object Storage.** GridFS stores files within MongoDB by chunking them. Object storage stores files externally and gives you a URL reference. GridFS is useful when files need database transactions or you have no external storage access. Object storage is better for almost everything else: cheaper, faster, CDN-integrated, and purpose-built for files.

**Base64 encoding in documents vs URL references.** Base64 encoding converts binary files to text strings so they fit in JSON documents. This increases file size by about 33% and bloats your database. URL references store only a string pointing to where the file lives externally. URL references are the standard approach — base64 should only be used for very small icons or when you genuinely need the file data in the database.

**Public URL access vs Presigned URLs.** Public URLs are accessible to anyone with the link. They're appropriate for profile pictures, product images, and public documents. Presigned URLs are temporary, signed URLs that grant access for a limited time. They're appropriate for private files where you need to verify permission before granting access. Use public URLs for content meant to be public; use presigned URLs for content meant to be private.

**CDN delivery vs Direct database serving.** CDN delivery caches files at edge locations worldwide, so users download from servers near them. Direct database serving means every request hits your database server, which is slower and more expensive. Object storage integrates with CDNs automatically. MongoDB does not. For any file accessed by users, CDN delivery is dramatically faster and cheaper.

**Cloudinary vs S3 + CloudFront.** Cloudinary is an all-in-one service: storage, CDN, and image transformations in one API. S3 + CloudFront gives you raw storage and a CDN, but you must build image processing separately (Lambda, external service, or client-side). Cloudinary is faster to implement and more expensive. S3 + CloudFront is cheaper but requires more engineering. Choose Cloudinary for speed of development; choose S3 + CloudFront for cost at scale.

## 8. 🧠 The Memory Hook — What Sticks

MongoDB is the valet desk — it keeps the ticket (URL). Object storage is the parking garage — it keeps the car (file). Never park cars at the valet desk.
