import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { ModuleHeader } from "../components/ModuleHeader";
import type { ParticipantModuleData } from "../types";

// Trailing empty rows so students can sign up for a module's remaining open
// spots by hand — one row per free slot, capped so the list doesn't grow
// unbounded for a mostly-empty module.
const MAX_OPEN_SLOT_ROWS = 4;

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  countLine: { fontSize: 10, color: "#444444", marginBottom: 10 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#000000" },
  row: { flexDirection: "row" },
  prefCell: {
    width: 50,
    padding: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  nameCell: {
    flexGrow: 1,
    padding: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  groupCell: {
    width: 100,
    padding: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  headerCellText: { fontWeight: 700 },
});

export function ParticipantListDocument({ modules }: { modules: ParticipantModuleData[] }) {
  return (
    <Document>
      {modules.map((module, moduleIndex) => {
        const openSlots = Math.max(0, module.max - module.studentCount);
        const openSlotRows = Math.min(openSlots, MAX_OPEN_SLOT_ROWS);
        return (
          <Page key={moduleIndex} size="A4" style={styles.page}>
            <ModuleHeader title={module.title} teacher={module.teacher} scheduleLabel={module.scheduleLabel} />
            <Text style={styles.countLine}>{`${module.studentCount} / ${module.max} Teilnehmer`}</Text>
            <View style={styles.table}>
              <View style={styles.row}>
                <View style={styles.prefCell}>
                  <Text style={styles.headerCellText}>Präf.</Text>
                </View>
                <View style={styles.nameCell}>
                  <Text style={styles.headerCellText}>Name</Text>
                </View>
                <View style={styles.groupCell}>
                  <Text style={styles.headerCellText}>Klasse</Text>
                </View>
              </View>
              {module.students.map((student, studentIndex) => (
                <View key={studentIndex} style={styles.row}>
                  <View style={styles.prefCell}>
                    <Text>{student.preference == null ? "–" : String(student.preference)}</Text>
                  </View>
                  <View style={styles.nameCell}>
                    <Text>{student.name}</Text>
                  </View>
                  <View style={styles.groupCell}>
                    <Text>{student.groupName ?? ""}</Text>
                  </View>
                </View>
              ))}
              {Array.from({ length: openSlotRows }, (_, blankIndex) => (
                <View key={`blank-${blankIndex}`} style={styles.row}>
                  <View style={styles.prefCell}>
                    <Text> </Text>
                  </View>
                  <View style={styles.nameCell}>
                    <Text> </Text>
                  </View>
                  <View style={styles.groupCell}>
                    <Text> </Text>
                  </View>
                </View>
              ))}
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
