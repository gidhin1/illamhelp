import { memberAuthConfig } from "@/lib/server/member-auth";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams
}: { searchParams: Promise<{ signin?: string }> }): Promise<JSX.Element> {
  const config = memberAuthConfig();
  const { signin } = await searchParams;
  return <LoginForm hosted={Boolean(config)} google={config?.google ?? false} facebook={config?.facebook ?? false}
    reset={config?.reset ?? false}
    retry={signin === "retry"} />;
}
