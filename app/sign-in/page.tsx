import { Suspense } from "react";
import { SignInForm } from "@/src/components/sign-in-form";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
