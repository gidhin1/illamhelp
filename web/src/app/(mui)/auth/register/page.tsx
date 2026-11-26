import { connection } from "next/server";
import { memberAuthConfig } from "@/lib/server/member-auth";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage(): Promise<JSX.Element> {
  await connection();
  const config = memberAuthConfig();
  return <RegisterForm google={config?.google ?? false} facebook={config?.facebook ?? false} />;
}
