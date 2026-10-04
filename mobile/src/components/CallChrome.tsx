import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  CALL_BG_FALLBACK,
  CALL_GRADIENT,
  CALL_GRADIENT_LOCATIONS,
} from "../theme/callColors";

/**
 * Smooth vertical slate→charcoal background.
 * No side vignettes (those caused the vertical stripe artifacts).
 */
export function CallChrome({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...CALL_GRADIENT]}
        locations={[...CALL_GRADIENT_LOCATIONS]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CALL_BG_FALLBACK,
  },
  content: {
    flex: 1,
  },
});
