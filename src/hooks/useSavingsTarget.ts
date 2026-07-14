import { useEffect, useState } from "react";
import { getSetting } from "../db/settings";

export function useSavingsTarget() {
  const [target, setTarget] = useState(0);

  useEffect(() => {
    getSetting<number>("yearly_savings_target").then((v) => {
      if (v && v > 0) setTarget(v);
    });
  }, []);

  return target;
}
