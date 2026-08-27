import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ModuleHeaderData } from "../types";

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  containerCompact: { marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  titleCompact: { fontSize: 11, fontWeight: 700, marginBottom: 1 },
  subtitle: { fontSize: 14, color: "#222222" },
  subtitleCompact: { fontSize: 8, color: "#444444" },
});

export function ModuleHeader({
  title,
  teacher,
  scheduleLabel,
  compact = false,
}: ModuleHeaderData & { compact?: boolean }) {
  const subtitleParts = [scheduleLabel, teacher].filter((part): part is string => Boolean(part));
  return (
    <View style={compact ? styles.containerCompact : styles.container}>
      <Text style={compact ? styles.titleCompact : styles.title}>{title}</Text>
      {subtitleParts.length > 0 && (
        <Text style={compact ? styles.subtitleCompact : styles.subtitle}>{subtitleParts.join(" · ")}</Text>
      )}
    </View>
  );
}
