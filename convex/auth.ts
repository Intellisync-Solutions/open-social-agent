import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

const passwordProvider = Password({
  profile(params) {
    const email =
      typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    return { email };
  },
  validatePasswordRequirements(password) {
    if (password.length < 12) {
      throw new ConvexError("Password must contain at least 12 characters.");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
});
