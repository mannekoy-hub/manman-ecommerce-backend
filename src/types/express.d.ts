declare global { // Add this field to Express's existing types everywhere in the project.
  namespace Express { // Open the namespace where Express keeps shared request types.
    interface Request { // Add the field to every Express request.
      userId?: string | number; // Store the user ID after the authentication check.
    } 
  } 
}

export {}; // Treat this file as a module so the global type change is applied.

/*This file tells TypeScript that Express requests are allowed to have an extra `userId` field, so your middleware can write `req.userId = decoded.id` without errors. It does this by merging a new `userId` property into Express's existing `Request` type for the whole project, which means you don't need a custom `AuthRequest` type anymore. It only affects TypeScript's type checking, not how your app runs, and `export {}` is there to make the file a module so `declare global` is allowed. */