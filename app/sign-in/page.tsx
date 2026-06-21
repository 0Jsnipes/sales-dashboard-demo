import { SignInForm } from "@/src/components/sign-in-form";
import { Suspense } from "react";

export default function Page() {
  return <Suspense fallback={null}><SignInForm/></Suspense>;
}
