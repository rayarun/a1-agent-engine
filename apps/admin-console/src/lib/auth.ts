// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
