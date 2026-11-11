import express from "express";
import prisma from "../lib/prismaClient.ts";
import authMiddleware from "../middleware/authMiddleware.ts"; // adjust the path to where your file is

const router = express.Router();

// Delivery fee in centavos. 0 = free delivery. Example: 5000 = Php 50.00
const DELIVERY_FEE_CENTS = 0;

const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

// Trim a text field and cap its length
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// Stops the transaction (rolling everything back) with a message for the user
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

// Decimal values become plain numbers for the front end
function toOrderResponse(order: any) {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    total: Number(order.total),
    createdAt: order.createdAt,
    address: {
      fullName: order.fullName,
      phone: order.phone,
      street: order.street,
      barangay: order.barangay,
      city: order.city,
      province: order.province,
      postalCode: order.postalCode,
      notes: order.notes,
    },
    items: order.items.map((item: any) => ({
      productId: item.productId,
      name: item.name,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
    })),
  };
}

//=================== Place an order (POST /orders) ===================//
// Body: { items: [{ productId, quantity }], address: { fullName, phone, street,
//         barangay, city, province, postalCode, notes? } }
router.post("/", authMiddleware, async (req, res) => {
  const userId = Number(req.userId);

  // 1. Validate the cart items
  const rawItems = req.body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    return res.status(400).json({ message: "Your cart is empty" });
  }

  const wanted = new Map<number, number>(); // productId -> quantity (duplicates merged)
  for (const raw of rawItems) {
    const productId = Number(raw?.productId);
    const quantity = Number(raw?.quantity);

    if (
      !Number.isInteger(productId) ||
      productId < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return res.status(400).json({ message: "Invalid item in your cart" });
    }
    wanted.set(productId, (wanted.get(productId) ?? 0) + quantity);
  }

  // 2. Validate the delivery address
  const a = req.body?.address ?? {};
  const address = {
    fullName: text(a.fullName, 100),
    phone: text(a.phone, 20),
    street: text(a.street, 200),
    barangay: text(a.barangay, 100),
    city: text(a.city, 100),
    province: text(a.province, 100),
    postalCode: text(a.postalCode, 10),
  };
  const notes = text(a.notes, 500) || null;

  if (Object.values(address).some((value) => !value)) {
    return res.status(400).json({ message: "Please complete all delivery address fields" });
  }
  if (!PHONE_RE.test(address.phone)) {
    return res.status(400).json({ message: "Please enter a valid phone number" });
  }

  try {
    // 3. Everything below succeeds together or not at all
    const order = await prisma.$transaction(async (tx) => {
      const ids = [...wanted.keys()];

      // Prices and stock always come from the database, never from the browser
      const found = await tx.products.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, price: true },
      });
      if (found.length !== ids.length) {
        fail(400, "One or more products in your cart no longer exist");
      }
      const byId = new Map(found.map((product) => [product.id, product]));

      let subtotalCents = 0;
      const lines = [];

      for (const [productId, quantity] of wanted) {
        const product = byId.get(productId);
        if (!product) fail(400, "One or more products in your cart no longer exist");

        // Take the stock only if enough is left (safe even if two people order at once)
        const updated = await tx.products.updateMany({
          where: { id: productId, stock_quantity: { gte: quantity } },
          data: { stock_quantity: { decrement: quantity } },
        });
        if (updated.count !== 1) {
          fail(409, `Not enough stock for "${product.name}"`);
        }

        const unitCents = Math.round(Number(product.price) * 100);
        subtotalCents += unitCents * quantity;
        lines.push({
          productId,
          name: product.name,
          unitPrice: (unitCents / 100).toFixed(2),
          quantity,
        });
      }

      const totalCents = subtotalCents + DELIVERY_FEE_CENTS;

      return tx.order.create({
        data: {
          userId,
          paymentMethod: "COD",
          subtotal: (subtotalCents / 100).toFixed(2),
          deliveryFee: (DELIVERY_FEE_CENTS / 100).toFixed(2),
          total: (totalCents / 100).toFixed(2),
          ...address,
          notes,
          items: { create: lines },
        },
        include: { items: true },
      });
    });

    res.status(201).json({ order: toOrderResponse(order) });
  } catch (error: any) {
    if (typeof error?.status === "number") {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(error instanceof Error ? error.message : error);
    res.sendStatus(500);
  }
});

//=================== My orders (GET /orders/me) ===================//
router.get("/me", authMiddleware, async (req, res) => {
  const userId = Number(req.userId);

  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    res.json({ orders: orders.map(toOrderResponse) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    res.sendStatus(500);
  }
});

//=================== One order (GET /orders/:id) ===================//
router.get("/:id", authMiddleware, async (req, res) => {
  const userId = Number(req.userId);
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid order id" });
  }

  try {
    // Filtering by userId means nobody can read someone else's order
    const order = await prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({ order: toOrderResponse(order) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    res.sendStatus(500);
  }
});

export default router;