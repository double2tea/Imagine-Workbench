"use client";

import { useCallback, useEffect, useState } from "react";
import { PRICE_SETTING_CHANGE_EVENT, getShowPriceSetting, setShowPriceSetting } from "@/lib/providers/pricing";

export function usePriceDisplaySetting(): [boolean, (value: boolean) => void] {
  const [showPrice, setShowPrice] = useState(false);

  useEffect(() => {
    const sync = () => setShowPrice(getShowPriceSetting());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(PRICE_SETTING_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PRICE_SETTING_CHANGE_EVENT, sync);
    };
  }, []);

  const updateShowPrice = useCallback((value: boolean) => {
    setShowPrice(value);
    setShowPriceSetting(value);
  }, []);

  return [showPrice, updateShowPrice];
}
