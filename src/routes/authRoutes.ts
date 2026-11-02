import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prismaClient.ts";

const prismaClient = prisma as any;
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if(!JWT_SECRET) throw new Error("JWT_SECRET is not set");


    //create a token
const signToken = (id: number | string ) =>
  jwt.sign({id}, JWT_SECRET, {expiresIn: "24h"});

// Register a new user endpoint (/auth/register)
router.post("/register", async (req, res) => {
  const username = req.body?.username?.trim().toLowerCase();
  const password = req.body?.password;

  if(!username || typeof password !== "string" || password.length < 8){
    return res
     .status(400).json({message: "Username and a passwrod of 8+ characters required"});
  }

  //encrypt the password
  try{
     const hashedPassword =  await bcrypt.hash(password, 10);

     const user = await prisma.user.create({
      data:{
        username,
        password: hashedPassword,
      }
     });
     res.status(201).json({token: signToken(user.id)});
  }
  catch(error: any){
     if(error?.code === "P2002"){
     return res.status(409).json({message: "Username already taken"});
  }
  console.error(error instanceof Error ? error.message : error);
  res.sendStatus(500);
}
});



router.post("/login", async (req, res) => {
   const username = req.body?.username?.trim().toLowerCase();
   const password = req.body?.password;

   if(!username || typeof password !== "string"){
    return res.status(400).json({ message: "Username and password required"});
   }

   try{
    const user = await prisma.user.findUnique({ where: {username}});
    const valid = user && (await bcrypt.compare(password, user.password));
   
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

export default router;
