import { ref, watch, type Ref } from "vue";

export type ThemeMode = "dark" | "light";

const defaultThemeMode = fetchFromLocalStorage() ?? fetchFromPreferences();

export function useThemeMode(): Ref<ThemeMode> {
  const themeMode = ref<ThemeMode>(defaultThemeMode);

  watch(
    themeMode,
    (mode) => {
      if (mode === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      storeInLocalStorage(mode);
    },
    { immediate: true },
  );
  return themeMode;
}

function fetchFromLocalStorage(): ThemeMode | undefined {
  return localStorage.getItem("themeMode") as ThemeMode;
}

function storeInLocalStorage(mode: ThemeMode): void {
  localStorage.setItem("themeMode", mode);
}

function fetchFromPreferences(): ThemeMode {
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
