import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ModuleHeaderData } from "../types";

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 14, color: "#222222" },
});

export function ModuleHeader({ title, teacher, scheduleLabel }: ModuleHeaderData) {
  const subtitleParts = [scheduleLabel, teacher].filter((part): part is string => Boolean(part));
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitleParts.length > 0 && <Text style={styles.subtitle}>{subtitleParts.join(" · ")}</Text>}
    </View>
  );
}
