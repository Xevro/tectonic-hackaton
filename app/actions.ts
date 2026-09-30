"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isDemoCustomer } from "@/lib/profiles";
import { resetDemo } from "@/lib/reset-demo";
import {
  CompassError,
  confirmMemory,
  confirmProposal,
  declineProposal,
  handleUserMessage,
  openHomeOffer,
  openNewSession,
} from "@/lib/turn";

async function customerId() {
  const jar = await cookies();
  const value = jar.get("compass_customer")?.value;
  if (isDemoCustomer(value)) return value;
  redirect("/");
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

function fail(error: unknown): never {
  if (error instanceof CompassError) throw new Error(error.message);
  throw new Error("That request could not be completed");
}

export async function selectCustomer(formData: FormData) {
  const id = z.enum(["mila", "sofie", "noah"]).parse(String(formData.get("customerId")));
  const jar = await cookies();
  jar.set("compass_customer", id, cookieOptions());
  jar.set("compass_beat", "", { ...cookieOptions(), maxAge: 0 });
  redirect("/compass");
}

export async function sendMessage(formData: FormData) {
  const id = await customerId();
  try {
    await handleUserMessage(id, String(formData.get("text") ?? ""));
  } catch (error) {
    fail(error);
  }
  revalidatePath("/compass");
}

export async function startSession() {
  const id = await customerId();
  await openNewSession(id);
  revalidatePath("/compass");
}

export async function approveAction(formData: FormData) {
  const id = await customerId();
  try {
    await confirmProposal(id, String(formData.get("actionId") ?? ""));
  } catch (error) {
    fail(error);
  }
  revalidatePath("/compass");
}

export async function rejectAction(formData: FormData) {
  const id = await customerId();
  try {
    await declineProposal(id, String(formData.get("actionId") ?? ""));
  } catch (error) {
    fail(error);
  }
  revalidatePath("/compass");
}

export async function acceptMemory(formData: FormData) {
  const id = await customerId();
  try {
    await confirmMemory(id, String(formData.get("memoryId") ?? ""));
  } catch (error) {
    fail(error);
  }
  revalidatePath("/compass");
}

export async function showLater() {
  const id = await customerId();
  if (id !== "mila") redirect("/compass");
  try {
    await openHomeOffer(id);
  } catch (error) {
    fail(error);
  }
  const jar = await cookies();
  jar.set("compass_beat", "later", cookieOptions());
  revalidatePath("/compass");
}

export async function resetDemoData() {
  await resetDemo();
  const jar = await cookies();
  jar.set("compass_beat", "", { ...cookieOptions(), maxAge: 0 });
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/compass");
}
