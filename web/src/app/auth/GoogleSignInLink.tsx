import Image from "next/image";
import styles from "./auth-flow.module.css";

export function GoogleSignInLink(): JSX.Element {
  return (
    // OAuth starts with a top-level browser navigation.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/auth/oidc/google" className={styles.google} aria-label="Sign in with Google">
      <Image src="/auth/google-sign-in-light.png" className={styles.googleLight} alt="" width={180} height={40} unoptimized />
      <Image src="/auth/google-sign-in-dark.png" className={styles.googleDark} alt="" width={180} height={40} unoptimized />
    </a>
  );
}
