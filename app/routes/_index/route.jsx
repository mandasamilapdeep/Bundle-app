import { useEffect } from "react";
import { redirect, Form, useLoaderData, useNavigate } from "react-router";
import { login, authenticate } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Redirect if inside Shopify Admin context
  if (
    url.searchParams.get("host") ||
    url.searchParams.get("embedded") ||
    url.searchParams.get("id_token")
  ) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Attempt admin authentication if session exists
  try {
    const { session } = await authenticate.admin(request);
    if (session?.shop) {
      const search = url.searchParams.toString();
      throw redirect(`/app${search ? `?${search}` : `?shop=${session.shop}`}`);
    }
  } catch (err) {
    if (err instanceof Response) throw err;
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();
  const navigate = useNavigate();

  useEffect(() => {
    // If embedded inside Shopify Admin iframe, redirect to /app
    if (typeof window !== "undefined" && window.top !== window.self) {
      navigate("/app" + window.location.search);
    }
  }, [navigate]);

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A short heading about [your app]</h1>
        <p className={styles.text}>
          A tagline about [your app] that describes your value proposition.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
        </ul>
      </div>
    </div>
  );
}
