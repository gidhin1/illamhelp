import Image from "next/image";
import styles from "./auth-flow.module.css";

export function FacebookSignInLink(): JSX.Element {
  return (
    // OAuth starts with a top-level browser navigation.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/auth/oidc/facebook" className={styles.facebook}>
      <Image src="/auth/facebook-logo.png" alt="" width={20} height={20} />
      <span>Continue with Facebook</span>
    </a>
  );
}
