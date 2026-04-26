import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useAdminAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const key = sessionStorage.getItem("admin_api_key");
    setIsAuthenticated(!!key);
    setIsLoading(false);

    if (!key && typeof window !== "undefined") {
      router.push("/login");
    }
  }, [router]);

  const login = (apiKey: string) => {
    sessionStorage.setItem("admin_api_key", apiKey);
    setIsAuthenticated(true);
  };

  const logout = () => {
    sessionStorage.removeItem("admin_api_key");
    setIsAuthenticated(false);
    router.push("/login");
  };

  return { isAuthenticated, isLoading, login, logout };
}

export function getAdminApiKey() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("admin_api_key");
}
