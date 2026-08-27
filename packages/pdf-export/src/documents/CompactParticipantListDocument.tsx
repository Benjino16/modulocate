import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { ModuleHeader } from "../components/ModuleHeader";
import type { ParticipantModuleData } from "../types";

// Fixed 3-column grid; react-pdf paginates automatically once a row of cards
// no longer fits the remaining page height (each card has `wrap={false}` so
// a module's roster is never split mid-table across pages).
const CARD_WIDTH = "33.33%";

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 7, fontFamily: "Helvetica" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: { width: CARD_WIDTH, padding: 6 },
  countLine: { fontSize: 7, color: "#444444", marginBottom: 4 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#000000" },
  row: { flexDirection: "row" },
  prefCell: {
    width: 20,
    padding: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  nameCell: {
    flexGrow: 1,
    padding: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  groupCell: {
    width: 36,
    padding: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  headerCellText: { fontWeight: 700 },
});

export function CompactParticipantListDocument({ modules }: { modules: ParticipantModuleData[] }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.grid}>
          {modules.map((module, moduleIndex) => (
            <View key={moduleIndex} wrap={false} style={styles.card}>
              <ModuleHeader
                title={module.title}
                teacher={module.teacher}
                scheduleLabel={module.scheduleLabel}
                compact
              />
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
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
