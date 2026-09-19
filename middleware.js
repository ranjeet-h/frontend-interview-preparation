// Edge Middleware: HTTP Basic Auth gate for the whole site.
// Set SITE_PASSWORD in Vercel (Project → Settings → Environment Variables).
// Optional SITE_USER (defaults to "viewer"). Unauthenticated requests get 401,
// so browsers show the native login prompt and bots never download the book.
export const config = { matcher: "/(.*)" };

const REALM = 'Basic realm="Full Stack Interview Study Book"';

export default function middleware(request) {
  const pass = process.env.SITE_PASSWORD;
  const user = process.env.SITE_USER || "viewer";
  const header = request.headers.get("authorization") || "";

  let authorized = false;
  if (pass && header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      authorized =
        sep !== -1 &&
        decoded.slice(0, sep) === user &&
        decoded.slice(sep + 1) === pass;
    } catch (e) {
      authorized = false;
    }
  }

  if (authorized) {
    // Tell Vercel to continue to the static asset.
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}
