import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prismaClient.ts";
import { OAuth2Client } from "google-auth-library";


const prismaClient = prisma as any;
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(googleClientId ?? "");

if(!JWT_SECRET) throw new Error("JWT_SECRET is not set");
if(!googleClientId) throw new Error("GOOGLE_CLIENT_ID is not set");


    //create a token
const signToken = (id: number | string ) =>
  jwt.sign({id}, JWT_SECRET, {expiresIn: "24h"});

//=================== Register a new user endpoint (/auth/register)=================//
router.post("/register", async (req, res) => {
  const username = typeof req.body?.username === "string"? req.body.username.trim().toLowerCase() : "";
  const email = typeof req.body?.email === "string"? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;

  if (
    !username ||
    typeof email !== "string" ||
    !email.includes("@") ||
    typeof password !== "string" ||
    password.length < 8
  ) {
    return res.status(400).json({
      message: "Username, a valid email, and a password of 8+ characters are required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
      },
    });

    res.status(201).json({ token: signToken(user.id) });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Username or email already taken" });
    }

    console.error(error instanceof Error ? error.message : error);
    res.sendStatus(500);
  }
});
//=================================================================================//




//============Login================================================#######
router.post("/login", async (req, res) => {
   const username = typeof req.body?.username === "string"? req.body.username.trim().toLowerCase() : "";
   const password = req.body?.password;

   if(!username || typeof password !== "string"){
    return res.status(400).json({ message: "Username and password required"});
   }

   try{
    const user = await prisma.user.findUnique({ where: {username}});
    const valid = !!user?.password && (await bcrypt.compare(password, user.password));
   
   if(!user || !valid){
    return res.status(401).json({message: "Invalid credentials"});
   }

   res.json({token: signToken(user.id)});
   
  }
  catch(error){
    console.error(error instanceof Error ? error.message : error);
    res.sendStatus(500);
  }
});
//================================================================================//




//========Username generator=========================================############
// Makes a unique username from the email, e.g. "john" or "john4821"
async function generateUsername(email: string): Promise<string> {
  const base =
    email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "user";
  let username = base;

  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return username;
}
//====================================================================#############




//===============================Google Route==================###################
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Missing credential" });
    }

    // 1. Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();//Opens and read what's inside the token. They holds things like email, email_verified, picture, and sub(google unique ID).

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ error: "Google email not verified" });
    }

    const userEmail = payload.email.toLocaleLowerCase();

    // 2. Find or create the user
    let user = await prisma.user.findUnique({ where: { email: userEmail } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          username: await generateUsername(userEmail),
          picture: payload.picture ?? null,
          googleId: payload.sub,
        },
      });
    } else if (!user.googleId) {
      // existing email/password user: link their Google account
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: payload.sub,
          picture: payload.picture ?? user.picture,
        },
      });
    }

    // 3. Issue your own JWT
    const token = signToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        picture: user.picture,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

export default router;
