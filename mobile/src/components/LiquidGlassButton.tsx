import { type ComponentProps, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Tone = "glass" | "danger" | "success" | "active";
type IconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  label?: string;
  icon?: IconName;
  /** Custom icon node (overrides `icon`). */
  iconNode?: ReactNode;
  tone?: Tone;
  disabled?: boolean;
  dimmed?: boolean;
  size?: number;
  iconSize?: number;
  iconRotateDeg?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * iOS-like liquid-glass call button with minimal line icons.
 */
export function LiquidGlassButton({
  label,
  icon,
  iconNode,
  tone = "glass",
  disabled,
  dimmed,
  size = 78,
  iconSize,
  iconRotateDeg,
  onPress,
  accessibilityLabel,
  style,
}: Props) {
  const interactive = Boolean(onPress) && !disabled;
  const radius = size / 2;
  const glyphSize = iconSize ?? Math.round(size * 0.36);
  const glyphColor =
    tone === "active" ? "#1C1C1E" : "#FFFFFF";

  return (
    <View style={[styles.wrap, style, dimmed && styles.dimmed]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={!interactive}
        hitSlop={12}
        // onPressIn responds even when JS is busy streaming playback audio.
        onPressIn={interactive ? onPress : undefined}
        style={({ pressed }) => [
          styles.circle,
          { width: size, height: size, borderRadius: radius },
          tone === "glass" && styles.glass,
          tone === "danger" && styles.danger,
          tone === "success" && styles.success,
          tone === "active" && styles.active,
          pressed && interactive && styles.pressed,
        ]}
      >
        <View
          pointerEvents="none"
          style={[styles.shine, { borderRadius: radius }]}
        />
        <View
          style={
            iconRotateDeg
              ? { transform: [{ rotate: `${iconRotateDeg}deg` }] }
              : undefined
          }
        >
          {iconNode ??
            (icon ? (
              <Ionicons name={icon} size={glyphSize} color={glyphColor} />
            ) : null)}
        </View>
      </Pressable>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 10,
    minWidth: 86,
  },
  dimmed: {
    opacity: 0.42,
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  glass: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  active: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.95)",
  },
  danger: {
    backgroundColor: "#FF3B30",
    borderColor: "rgba(255,255,255,0.2)",
    shadowColor: "#FF3B30",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  success: {
    backgroundColor: "#34C759",
    borderColor: "rgba(255,255,255,0.2)",
    shadowColor: "#34C759",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  shine: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  pressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.92,
  },
  label: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    fontWeight: "400",
    letterSpacing: 0.1,
  },
});
