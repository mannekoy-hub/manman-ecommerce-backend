import express from "express";
import multer from "multer";
import prisma from "../lib/prismaClient.ts";


const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

//== { Creates a mini-map that holds only the product routes. }====//
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(), //={ keeps the uploaded file in RAM as  Buffer(req.file.buffer) instead of saving it to a folder. }=##
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB

  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("INVALID_FILE_TYPE"));
    }
    //This is a gatekeeper function. Multer runs it once for every file in an upload, and it decides: accept this file or reject it
  },

});

//==================================================##################

//===={ this code  will let the typescript know that the mutler adds a file property to req. } ======//
interface ProductUploadRequest extends express.Request {
  //={ extends express.Request means it has everything a normal request has, plus more. }=##

  file?: {
    //=={ this line is optional because the client may send no file. }==#
    buffer: Buffer; //=={ holds the raw bytes of the image. }==#
    mimetype: string; //=={ holds the file type, like "image/png" or "image/jpg".
  };
}
//=================================================#################

//######====GET /products: list products (no image bytes)=======##############
//######=={ Registers a handler for GET /products. It’s async because database calls return promises. _req starts with an underscore to signal “I receive this but don’t use it.” }==############
router.get("/", async (_req: express.Request, res: express.Response) => {
  const products = await prisma.products.findMany({
    //Asks Prisma for multiple rows from the products table (SQL: SELECT FROM products). await pauses until the database answers.
    select: {
      id: true,
      name: true,
      price: true,
      stock_quantity: true,
      category_id: true,
      image_type: true,
    },
    orderBy: { id: "asc" }, //sorts by id ascending, so products come back in a stable order.
  });

  res.json(products); //Sends an array back as JSON type with status 200.
});
//=======================================================#############

//=======================================================##############

//####=== POST /products: create a product, image is optional=====#######
//==={ registers POST/products.Between the path and the handler sits upload.single("image");, middleware that runs first. It looks for one file in a form field name "image" and loads it into a memory and put it on the req.file and put the text on the req.body. }==#
router.post(
  "/",
  upload.single("image"),
  async (req: ProductUploadRequest, res: express.Response) => {
    //={ destructures the text fields from the form. ?? {} means if req.body is null or undefined, use an empty object. }=#
    const { name, price, stock_quantity, category_id } = req.body ?? {};

    // validates the input. the request is invalid:
    //!name: name is missing or empty,
    //Number.isNaN(Number(price)): price can’t be converted to a number (like "abc"),
    //Number(price) < 0: price is negative.
    if (!name || Number.isNaN(Number(price)) || Number(price) < 0) {
      res.status(400).json({ error: "Name and a valid price are required" });
      return;
    }

    //Insert a new row(SQL: INSERT INTO products...).
    const product = await prisma.products.create({
      data: {
        //data holds the value.
        name, //save the name
        price: Number(price), //converts the  string price to a real number.
        stock_quantity: stock_quantity ? Number(stock_quantity) : 0, //if stock quantity was sent, convert it to a number.Otherwise default zero.
        category_id: category_id ? Number(category_id) : null, //if category was sent, convert it.Otherwise store null(no category).
        image_data: req.file ? new Uint8Array(req.file.buffer) : null,
        image_type: req.file ? req.file.mimetype : null,
        /* { If a file was uploaded, store its bytes in image_data and its type in image_type. Otherwise store null in both, which is how image is optional works. new Uint8Array(...) converts Node’s Buffer into the type Prisma expects for a Bytes column (Prisma 7 uses Uint8Array) }.
         */
      },
      select: { id: true, name: true }, //only return the new products id and name, not the image bytes.
    });

    res.status(201).json(product); // Replies with 201 Created(the correct code for "something new was made") plus the JSON.
  },
);

//####=== GET /products/:id/image: send the picture stored in Postgres====#######
//{:id is a route parameter.For /products/5/image, req.params.id id "5"}
router.get(
  "/:id/image",
  async (req: express.Request, res: express.Response) => {
    /* { Finds exactly one product by its unique id. Number(...) converts the URL string to a number. It selects only the image columns, so nothing else is loaded } */
    const product = await prisma.products.findUnique({
      where: { id: Number(req.params.id) },
      select: { image_data: true, image_type: true },
    });

    if (!product?.image_data) {
      res.status(404).end();
      return;
      /*product?.image_data uses optional chaining, so it doesn’t crash if product is null. The condition is true when the product doesn’t exist or has no image. Either way the reply is 404 Not Found, and .end() sends it with no body. */
    }

    res.set("Content-Type", product.image_type ?? "image/jpeg"); //sets the content-type header so the browser knows how to display the bytes. if image_type is somehow null, it falls back to "image/jpeg"

      res.set("Cache-Control", "public, max-age=3600");

    res.send(
      Buffer.from(product.image_data),
    ); /*Converts the stored bytes back into a Node Buffer and sends them as the response body. Because of this, you can use <img src="/products/5/image" /> directly in your frontend. */
  },
);
//==========================================================####################

//==========================================================####################


// PATCH /products/:id/image: attach or replace the image of an existing product
router.patch(
  "/:id/image",
  upload.single("image"),
  async (req: ProductUploadRequest, res: express.Response) => {
    const id = Number(req.params.id); //patch means "partially update an existing resourse." the mutler middleware runs again for the "image" field. The URL's id is converted to a number once and reused.

    if (!req.file) {
      res
        .status(400)
        .json({ error: "Image file is required (field name: image)" });
      return;
      //if no file arrived, reply 400.
    }

    try {
      const product = await prisma.products.update({
        where: { id },
        data: {
          image_data: new Uint8Array(req.file.buffer),
          image_type: req.file.mimetype,
        },
        select: { id: true, name: true, image_type: true },
      });
      res.json(product); //Inside try, Prisma updates the row with that id (SQL: UPDATE products SET ... WHERE id = ...), overwriting any previous image. It returns a small summary without the bytes, which res.json sends back with status 200.

    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2025") {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      throw error; // update throws an error if the row doesn't exist.
    }
  },
);



export default router;
