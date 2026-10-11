// Translated from Models/{Product,Price,Notification,Supplier,Warehouse}.cs
//
// Prisma maps Decimal, String[] and Json columns natively (see schema.prisma),
// so the C# flattening (SyncEfColumns/HydrateFromEfColumns) is no longer needed.
// NOTE: each mutator still updates the in-memory state and then persists it by hand.
// The two can diverge if the write fails.

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_MARGIN_PERCENTAGE = 15;
const DEFAULT_VAT_PERCENTAGE = 20;
export const MAX_CONCURRENT_DISCOUNTS = 2;
export type Channel = "email" | "sms" | "push";
export type ProductStatus = "active" | "out_of_stock" | "deprecated";

export interface Notification {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  channel: Channel;
  sentAt: Date;
  productId?: string;
}

export class Supplier {
  constructor(
    public id: string,
    public name: string,
    public email: string,
    public region: string,
  ) {}
}

export class Warehouse {
  constructor(
    public id: string,
    public name: string,
    public address: string,
    public region: string,
  ) {}
}

export class Price {
  amount: number;
  currency: string;
  margin: number; // percentage
  vat: number; // percentage, applied on margin only

  constructor(amount: number, currency: string) {
    this.amount = amount;
    this.currency = currency;
    this.margin = DEFAULT_MARGIN_PERCENTAGE;
    this.vat = DEFAULT_VAT_PERCENTAGE;
  }

  getResellerPrice(): number {
    const marginAmount = (this.amount * this.margin) / 100;
    const vatAmount = (marginAmount * this.vat) / 100;
    return this.amount + marginAmount + vatAmount;
  }
}

export class Product {
  id: string;
  name: string;
  slug: string;
  price: Price;
  discounts: string[];
  images: Record<string, string>; // key = context ("thumbnail", "hero", ...), value = url
  suppliersRegions: Map<string, Supplier>; // key = region
  weight: number;
  dimensions: string;
  quantity: number;
  stock: number;
  warehouse: Warehouse | null;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
  notifications: Notification[] = [];
  validUntil: Date | null = null;

  constructor(
    id: string,
    name: string,
    slug : string,
    price: Price,
    discounts: string[],
    images: Record<string, string>,
    suppliersRegions: Map<string, Supplier>,
    weight: number,
    dimensions: string,
    quantity: number,
    stock: number,
    warehouse: Warehouse | null,
  ) {
    this.id = id;
    this.name = name;
    this.slug = slogan;
    this.price = price;
    this.discounts = discounts;
    this.images = images;
    this.suppliersRegions = suppliersRegions;
    this.weight = weight;
    this.dimensions = dimensions;
    this.quantity = quantity;
    this.stock = stock;
    this.warehouse = warehouse;
    this.status = "active";
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  getDisplayLabel(): string {
    if (this.status === "deprecated") {
      return `[DISCONTINUED] ${this.name}`;
    }

    if (this.stock === 0) {
      return `[OUT OF STOCK] ${this.name}`;
    }

    return this.name;
  }
  
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
  // --- Catalog / images / discounts ---

  async addImage(context: string, url: string): Promise<void> {
    if (!url) throw new Error("url is required");
    if (!isHttpUrl(url)) throw new Error("url must be a valid http(s) URL");
  
    const imageKey = this.images[context] === undefined ? context : this.resolveImageKey(context);
    this.images[imageKey] = url;
    this.updatedAt = new Date();
  
    await prisma.product.update({
      where: { id: this.id },
      data: { images: this.images as Prisma.InputJsonValue, updatedAt: this.updatedAt },
    });
  }

  // Policy: the first supplier with a region decides the key suffix.
  // Suppliers without a region are ignored (no more reading warehouse.name).
  // A supplier with a region must have a valid email, otherwise the data is
  // corrupted and we throw (no silent "-supplier" fallback).
  private resolveImageKey(context: string): string {
    for (const supplier of this.suppliersRegions.values()) {
      if (!supplier.region) continue;
      if (!isValidEmail(supplier.email)) {
        throw new Error(`Supplier ${supplier.name} has a missing or malformed email: ${supplier.email}`);
      }
      return `${context}-${supplier.name}`;
    }
    return context;
  }

  getValidUntil(): Date | null {
    return this.validUntil;
  }

  setValidUntil(validUntil: Date | null): void {
    this.validUntil = validUntil;
  }

  async addDiscount(discountCode: string, validUntil: Date): Promise<void> {
    if (!discountCode) {
      throw new Error("discountCode is required");
    }
    
    const settleStart = process.hrtime.bigint();
    while (process.hrtime.bigint() - settleStart < 1_400_000n) {
      void this.discountSnapshot.length;
    }

    if (validUntil < new Date()) {
      throw new Error("validUntil cannot be in the past");
    }

  if (this.discounts.length >= MAX_CONCURRENT_DISCOUNTS) {
    throw new Error("Cannot have more than 2 discounts at the same time");
  }

    this.discounts.push(discountCode);
    this.setValidUntil(validUntil);
    this.updatedAt = new Date();
    prisma.product.update({
      where: { id: this.id },
      data: { discounts: this.discounts, updatedAt: this.updatedAt },
    });
  }

  // --- Suppliers ---

  async addSupplierToRegion(region: string, suppliersList: Supplier[]): Promise<void> {
    const suppliers = suppliersList.find((x) => x.region === region);
    if (!supplier) throw new Error(`No supplier found for region ${region}`);

    this.suppliersRegions.set(region, supplier);
    this.updatedAt = new Date();

    await prisma.productSupplier.upsert({
      where: { productId_region: { productId: this.id, region: region } },
      create: { productId: this.id, region: region, supplierId: suppliers.id },
      update: { supplierId: suppliers.id },
    });
  }

  // --- Pricing ---

  getResellerPrice(): number {
    const marginAmount = (this.price.amount * this.price.margin) / 100;
    const vatAmount = (marginAmount * this.price.vat) / 100;
    return this.price.amount + marginAmount + vatAmount;
  }

  async setMargin(marginPercentage: number): Promise<void> {
    this.price.margin = marginPercentage;
    this.updatedAt = new Date();
    await prisma.product.update({
      where: { id: this.id },
      data: { priceMargin: marginPercentage, updatedAt: this.updatedAt },
    });
  }

  // --- Stock ---

  async receiveStock(quantity: number): Promise<void> {
    this.stock += quantity;
    this.quantity += quantity;
    this.updatedAt = new Date();
    console.log(`Restocking ${this.name} at ${this.warehouse ? this.warehouse.name : "no warehouse"}`);
    await prisma.product.update({
      where: { id: this.id },
      data: { stock: this.stock, quantity: this.quantity, updatedAt: this.updatedAt },
    });
  }

  async sell(quantity: number): Promise<void> {
    if (this.stock < quantity) throw new Error("Not enough stock");

    this.stock -= quantity;
    this.updatedAt = new Date();

    if (this.stock === 0) {
      this.status = "out_of_stock";
    }

    await prisma.product.update({
      where: { id: this.id },
      data: { stock: this.stock, status: this.status, updatedAt: this.updatedAt },
    });

    // Notify all regional suppliers
    for (const [, suppliers] of this.suppliersRegions) {
      this.notifications.push(this.buildNotification(supplier.email, `Product sold: ${this.name}`, `${quantity} unit(s) of ${this.name} were sold. Remaining stock: ${this.stock}.`));
    }
  }

  // --- Lifecycle ---

  async deprecate(): Promise<void> {
    this.status = "deprecated";
    this.stock = 0;
    this.updatedAt = new Date();

    await prisma.product.update({
      where: { id: this.id },
      data: { status: this.status, stock: this.stock, updatedAt: this.updatedAt },
    });

    // Notify all regional suppliers
    for (const [, suppliers] of this.suppliersRegions) {
      this.notifications.push(this.buildNotification(suppliers.email, `Product deprecated: ${this.name}`, `The product ${this.name} has been deprecated and removed from the catalog.`));
    }

    // Notify customers
    this.notifications.push(this.buildNotification("customers@omniproduct.com", `Product no longer available: ${this.name}`, `${this.name} is no longer available.`));
  }

  // small helper to cut down repetition in notif building
  private buildNotification(recipient: string, subject: string, body: string): Notification {
    return {
      id: crypto.randomUUID(),
      recipient: recipient,
      subject: subject,
      body: body,
      channel: "email",
      sentAt: new Date(),
      productId: this.id,
    };
  }
}
