import { NextFunction, Request, Response } from "express"; // Use Express types for the request, response, and next step.
import jwt from "jsonwebtoken"; // Use JWT tools to check whether a token is trusted.

function authMiddleware(req: Request, res: Response, next: NextFunction): void { // Check a request's token before its route runs.

  const authHeader = req.headers.authorization; // Read the Authorization header sent by the user.

  if (!authHeader) { // Stop when the request has no Authorization header.

    res.status(401).json({ message: "No token provided" }); // Tell the user they need to send a token.

    return; // Do not continue to the route.
  } // Finish checking for a missing header.

  const parts = authHeader.trim().split(/\s+/); // Split the header into words, even if spaces are repeated.

  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) { // Require exactly "Bearer" and one token.

    res.status(401).json({ message: "Invalid authorization header format" }); // Explain that the header is not in the expected format.
    return; // Do not continue with a badly formatted header.
  } // Finish checking the header format.


  const token = parts[1]; // Keep the token part for verification.
  const jwtSecret = process.env.JWT_SECRET; // Read the secret used to sign trusted tokens.

  if (!jwtSecret) { // Stop if the server has no secret configured.

    console.error("JWT_SECRET is missing from environment variables"); // Record the setup problem for the server owner.

    res.status(500).json({ message: "Server configuration error" }); // Give the user a general server error.

    return; 
  }

  let decoded: string | jwt.JwtPayload; // Store the verified token data or its plain-text form.

  try { // Catch problems that happen while checking the token.
    decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }); // Accept only tokens signed with HS256.

  } catch (error) { // Handle expired and otherwise invalid tokens separately.
    if (error instanceof jwt.TokenExpiredError) { // Check whether the token passed its expiry time.

      res.status(401).json({ message: "Token expired" }); // Tell the user they need a fresh token.

      return; 
    } 

    res.status(401).json({ message: "Invalid token" }); // Reject tokens that are damaged or not trusted.

    return;
  } 

  if (typeof decoded === "string") { // A plain-text token does not contain the user ID we need.

    res.status(401).json({ message: "Invalid token payload" }); // Reject a token without an object payload.

    return;
  }

  const userId = decoded.id; // Read the user ID saved in the token.

  if (typeof userId !== "string" && typeof userId !== "number") { // Make sure the ID is a simple string or number.

    res.status(401).json({ message: "Invalid token payload" }); // Reject a missing or unusable user ID.

    return; 
  }

  req.userId = userId; // Save the checked ID so the route can use it.
  next(); // Allow the request to continue to its route.
} 

export default authMiddleware; // Make the middleware available to the routes.

//auth middleware make sure that the users token is trusted, make sure the user with a valid login token can reach protected routes.
// tells thoes routes which user is making the request.