import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { ModuleHeader } from "../components/ModuleHeader";
import type { AttendanceModuleData } from "../types";

// "Tage" here are arbitrary session slots a teacher checks off by hand over
// the course of the module — unrelated to the `dates` entity in the schema
// (that's the weekly time-slot a module runs at, not individual sessions).
const DAY_COLUMNS = 10;
const TRAILING_BLANK_ROWS = 3;

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica" },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#000000" },
  row: { flexDirection: "row" },
  nameCell: {
    width: 170,
    padding: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  groupCell: {
    width: 60,
    padding: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  // Left blank on purpose — a teacher fills in the date by hand, one column
  // per session, so no column label is printed. Tall enough to write a date
  // into by hand.
  dayHeaderCell: {
    width: 18,
    height: 40,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  dayCell: {
    width: 18,
    height: 20,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  headerCellText: { fontWeight: 700 },
});

function DayColumns({ variant }: { variant: "header" | "body" }) {
  const cellStyle = variant === "header" ? styles.dayHeaderCell : styles.dayCell;
  return (
    <>
      {Array.from({ length: DAY_COLUMNS }, (_, day) => (
        <View key={day} style={cellStyle} />
      ))}
    </>
  );
}

export function AttendanceListDocument({ modules }: { modules: AttendanceModuleData[] }) {
  return (
    <Document>
      {modules.map((module, moduleIndex) => (
        <Page key={moduleIndex} size="A4" style={styles.page}>
          <ModuleHeader title={module.title} teacher={module.teacher} scheduleLabel={module.scheduleLabel} />
          <View style={styles.table}>
            <View style={styles.row}>
              <View style={styles.nameCell}>
                <Text style={styles.headerCellText}>Name</Text>
              </View>
              <View style={styles.groupCell}>
                <Text style={styles.headerCellText}>Klasse</Text>
              </View>
              <DayColumns variant="header" />
            </View>
            {module.students.map((student, studentIndex) => (
              <View key={studentIndex} style={styles.row}>
                <View style={styles.nameCell}>
                  <Text>{student.name}</Text>
                </View>
                <View style={styles.groupCell}>
                  <Text>{student.groupName ?? ""}</Text>
                </View>
                <DayColumns variant="body" />
              </View>
            ))}
            {Array.from({ length: TRAILING_BLANK_ROWS }, (_, blankIndex) => (
              <View key={`blank-${blankIndex}`} style={styles.row}>
                <View style={styles.nameCell}>
                  <Text> </Text>
                </View>
                <View style={styles.groupCell}>
                  <Text> </Text>
                </View>
                <DayColumns variant="body" />
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}
