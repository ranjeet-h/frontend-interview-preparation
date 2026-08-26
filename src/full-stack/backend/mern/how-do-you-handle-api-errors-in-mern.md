# How do you handle API errors in MERN

## 1. The Real-World Problem — When You Actually Hit This

Your app works fine in development. Users can sign up, log in, and update their profiles. Then you deploy to production. One day, a user tries to reset their password and sees a generic "Something went wrong" message. They try again—same message. They assume your app is broken and leave.

You check the logs. The backend returned a 400 error because the email format was invalid, but your frontend didn't show that specific message. Instead, your catch block just displayed a generic error toast. Another user gets a 401 because their token expired, but your app treated it the same as a network error—showing "check your connection" instead of redirecting to login.

The problem: your frontend and backend are speaking different error languages. The backend knows exactly what went wrong, but that information never reaches the user in a useful way. You need a standardized error-handling system that carries the real problem from the backend, through your API client, to the right place in your UI.

## 2. The Analogy — Make the Mechanic Obvious

Think of error handling like an emergency response system in a hospital.

When a patient arrives (a request), the triage nurse (your backend) assesses the problem. If it's critical, they don't just say "something is wrong"—they send a coded alert: "CARDIAC_ARREST, Room 302, patient unconscious." This structured message tells the response team exactly what to do and where to go.

The radio dispatcher (your API client) receives that coded alert and broadcasts it to the right specialist teams. They don't invent their own codes—they translate the nurse's exact message into a format each team understands.

The specialist teams (your frontend components) receive the dispatch and take action: the cardiac team rushes to Room 302, the surgical team preps the operating room, the administrative team notifies the family. Each team responds appropriately based on the specific code they received.

If the triage nurse just shouted "emergency!" with no details, the response would be chaotic. Everyone would run everywhere, and the patient might not get the right help in time. Your error handling works the same way—structured codes let the right part of your UI respond correctly.

## 3. The Full Explanation — How It Actually Works

Error handling in MERN needs to work at three layers: the backend, the API client, and the frontend. Each layer has a specific job, and they need to agree on a shared contract.

**Backend: The Source of Truth**

Your Express backend should catch all errors in one place and return a consistent JSON format. Don't let different endpoints return different shapes. Use a global error handler middleware that catches errors from anywhere in your request pipeline and normalizes them.

The format needs three parts: a human-readable message for users, a machine-readable code for your frontend logic, and optional details for field-specific errors like form validation. The code field is what lets your frontend decide what to do programmatically—redirect, retry, show inline errors, or display a toast.

**API Client: The Translator**

Your Axios or fetch client sits between backend and frontend. Its job is to catch every error response and normalize it into a consistent shape before your React components ever see it. Use an interceptor to transform non-2xx responses into a standard error object.

The interceptor also distinguishes between network errors (no response at all) and API errors (server responded with an error status). Network errors need a "check your connection" message with a retry button. API errors need specific handling based on their code.

**Frontend: The Responder**

Your React components, especially with TanStack Query, receive the normalized error and map it to UI behavior. Auth errors trigger token refresh or login redirects. Validation errors show inline messages next to the specific form fields. Not-found errors redirect to a 404 page. Server errors show a generic toast with a retry option.

For forms, you need to map the backend's field-level validation errors to your form library's error structure. The field names must match between backend validation schema and frontend form fields—share these as constants so they never drift apart.

**The Shared Contract**

The critical piece is that both frontend and backend agree on the error codes and field names. Define these in a shared constants file or use TypeScript types that both sides import. This prevents the backend from returning `EMAIL_INVALID` while the frontend looks for `INVALID_EMAIL`.

## 4. See It In Practice — Real Code or Queries

**Backend: Express Global Error Handler**

```javascript
// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  // Log the error for debugging
  console.error('Error:', err);

  // Default error structure
  const error = {
    error: err.message || 'Internal server error',
    code: err.code || 'SERVER_ERROR',
    details: err.details || null
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    error.code = 'VALIDATION_ERROR';
    error.details = Object.keys(err.errors).map(field => ({
      field,
      message: err.errors[field].message
    }));
  } else if (err.name === 'JsonWebTokenError') {
    error.code = 'TOKEN_INVALID';
  } else if (err.name === 'TokenExpiredError') {
    error.code = 'TOKEN_EXPIRED';
  } else if (err.name === 'CastError') {
    error.code = 'NOT_FOUND';
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json(error);
};

app.use(errorHandler);
```

**API Client: Axios Interceptor**

```javascript
// utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL
});

// Response interceptor to normalize errors
api.interceptors.response.use(
  response => response,
  error => {
    // Network error - no response from server
    if (!error.response) {
      return Promise.reject({
        message: 'Network error. Please check your connection.',
        code: 'NETWORK_ERROR',
        status: null
      });
    }

    // API error - server responded with error status
    const { data, status } = error.response;
    return Promise.reject({
      message: data.error || 'An error occurred',
      code: data.code || 'SERVER_ERROR',
      details: data.details || null,
      status
    });
  }
);

export default api;
```

**Frontend: TanStack Query Error Handling**

```javascript
// hooks/useUsers.js
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';

export const useUsers = () => {
  const { data, error, isError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data)
  });

  // Handle errors based on code
  if (isError) {
    if (error.code === 'TOKEN_EXPIRED') {
      // Trigger token refresh logic
      refreshToken();
    } else if (error.code === 'TOKEN_INVALID') {
      // Redirect to login
      window.location.href = '/login';
    } else if (error.code === 'NETWORK_ERROR') {
      // Show connection error with retry
      showNetworkErrorToast(() => refetch());
    } else {
      // Show generic error toast
      showToast(error.message);
    }
  }

  return { data, error, isError };
};
```

**Frontend: Form Error Mapping with React Hook Form**

```javascript
// components/SignupForm.js
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import api from '../utils/api';

const SignupForm = () => {
  const { setError } = useForm();
  const mutation = useMutation({
    mutationFn: (data) => api.post('/auth/signup', data),
    onError: (error) => {
      // Map backend validation errors to form fields
      if (error.code === 'VALIDATION_ERROR' && error.details) {
        error.details.forEach(({ field, message }) => {
          setError(field, { type: 'server', message });
        });
      }
    }
  });

  const onSubmit = (data) => mutation.mutate(data);

  // ... form JSX
};
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you handle API errors across the MERN stack?**

I handle errors at three layers with a consistent contract. On the backend, I use a global Express error handler that catches all errors and returns a standardized JSON format with three fields: `error` (human-readable message), `code` (machine-readable identifier), and optional `details` (field-level validation errors). The API client uses an Axios interceptor to normalize all errors into this same shape and distinguish between network errors (no response) and API errors (server responded). The frontend, using TanStack Query, maps error codes to specific UI behaviors—`TOKEN_EXPIRED` triggers a refresh, `VALIDATION_ERROR` shows inline form messages, `NETWORK_ERROR` shows a connection error with retry, and other errors show toast notifications. I define all error codes in a shared constants file so frontend and backend always agree.

**Q: What error response format should you use?**

I use a standardized format with three fields: `error` for the human-readable message, `code` for the machine-readable identifier, and `details` for field-level validation errors. For example, a validation error returns `{ error: 'Validation failed', code: 'VALIDATION_ERROR', details: [{ field: 'email', message: 'Invalid email' }] }`. An auth error returns `{ error: 'Token expired', code: 'TOKEN_EXPIRED' }`. The `code` field is critical because it lets the frontend handle different error types programmatically. Without it, the frontend would have to parse error strings, which is fragile and breaks easily. I define all possible error codes in a shared file that both frontend and backend import.

**Q: How do you map backend validation errors to frontend form errors?**

The backend returns validation errors in a `details` array with `field` and `message` for each failed validation. The frontend API client catches this in the error object and transforms it into form library calls. For React Hook Form, I iterate through the `details` array and call `form.setError(field, { type: 'server', message })` for each field. The critical requirement is that field names match exactly between the backend validation schema and the frontend form fields. I share these field names as constants between frontend and backend to prevent drift. I also share Zod schemas when possible so validation rules are identical on both sides.

**Q: How do you handle network errors vs. API errors?**

I distinguish them in the API client interceptor by checking if `error.response` exists. If it does, the server responded with an error status—that's an API error with a structured response. If `error.response` is missing but `error.request` exists, the request was made but no response came back—that's a network error like a disconnected internet or down server. Network errors get a "check your connection" message with a retry button. API errors get specific handling based on their error code—validation errors show inline messages, auth errors redirect, server errors show generic messages. Treating them the same confuses users; a network disconnect shouldn't show "Internal server error."

**Q: How do you handle errors in TanStack Query?**

TanStack Query provides `isError` and `error` state out of the box. For queries, I check `isError` and handle errors based on the `error.code` field. For mutations, I use the `onError` callback to map validation errors back to form fields using the form library's `setError` method. I also configure retry logic—transient server errors (5xx) get retried automatically up to 3 times, but client errors (4xx) don't get retried because they won't succeed without user action. The key is mapping error codes to specific UI behaviors rather than showing a generic error for everything.

## 6. The Traps — What Goes Wrong in Production

**Inconsistent error formats across endpoints**

If one endpoint returns `{ message: 'Invalid email' }` and another returns `{ error: 'Invalid email', code: 'VALIDATION_ERROR' }`, your frontend can't handle errors uniformly. Every endpoint needs different error-handling logic, which is fragile and breaks when you add new endpoints. Always use a global error handler that enforces a single format.

**Missing machine-readable error codes**

If you only return a human-readable message like "Invalid email," your frontend has to parse strings to decide what to do. This breaks when messages change or when you support multiple languages. Always include a `code` field that never changes—`VALIDATION_ERROR`, `TOKEN_EXPIRED`, `NOT_FOUND`. The message can be localized; the code stays constant.

**Field name mismatches between frontend and backend**

If the backend validates `emailAddress` but the frontend form field is `email`, validation errors won't map to the right form field. Share field name constants between frontend and backend, or better yet, share the entire validation schema using Zod or a similar library.

**Treating network errors like API errors**

Showing "Internal server error" when the user's internet is disconnected is confusing. The user will retry and keep seeing the same message, assuming your app is broken. Check for `error.response` in your interceptor—if it's missing, show a network-specific message with a retry button.

**Not handling mutation errors in forms**

If you only show a toast error when a form submission fails, the user doesn't know which field is invalid. Use the mutation's `onError` callback to map validation errors back to specific form fields so users see inline error messages next to the problematic inputs.

**Hardcoding error codes as strings**

If you write `if (error.code === 'TOKEN_EXPIRED')` in ten different components and later change the code to `AUTH_TOKEN_EXPIRED`, you have to update ten places. Define error codes as constants and import them everywhere. One change, one file.

## 7. Compare With Related Concepts

**API error handling vs. HTTP status codes**

HTTP status codes (400, 401, 404, 500) are broad categories. Error codes (`VALIDATION_ERROR`, `TOKEN_EXPIRED`) are specific identifiers within those categories. Status codes tell you the class of error; error codes tell you exactly what happened. Use both—status codes for infrastructure-level decisions (retry 5xx, don't retry 4xx), error codes for application-level decisions (redirect on auth error, show inline messages on validation error).

**API error handling vs. Database error handling**

Database errors happen at the data layer—constraint violations, connection failures, query timeouts. API error handling is what you expose to the frontend. Don't leak raw database errors to the client; they might reveal schema details or security information. Catch database errors in your backend and map them to appropriate API error codes like `VALIDATION_ERROR` or `SERVER_ERROR`.

**API error handling vs. Validation**

Validation is one source of errors, but not the only one. Authentication failures, authorization denials, not-found resources, rate limits, and transient server failures all generate errors too. Your error-handling system needs to handle all of these, not just validation. The `code` field is what distinguishes them.

**API error handling vs. Logging**

Error handling is about user-facing communication and application behavior. Logging is about debugging and monitoring. Do both—log the full error details on the backend for your team, but send a clean, structured error to the frontend for users. Don't send stack traces or internal implementation details to the client.

## 8. 🧠 The Memory Hook — What Sticks

**Structured error response + API client translator + Frontend code router.** Backend sends coded errors, client normalizes them, frontend routes them to the right UI behavior based on the code.
