import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { StudentListData } from "../types";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  studentName: { fontSize: 22, fontWeight: 700, marginBottom: 2 },
  groupName: { fontSize: 13, color: "#222222", marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#000000" },
  row: { flexDirection: "row" },
  moduleCell: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  scheduleCell: {
    width: 90,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  categoryCell: {
    width: 110,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  teacherCell: {
    width: 110,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  headerCellText: { fontSize: 11, fontWeight: 700 },
  cellText: { fontSize: 11 },
  emptyText: { fontSize: 11, color: "#444444" },
});

export function StudentListDocument({ students }: { students: StudentListData[] }) {
  return (
    <Document>
      {students.map((student, studentIndex) => (
        <Page key={studentIndex} size="A4" style={styles.page}>
          <Text style={styles.studentName}>{student.studentName}</Text>
          <Text style={styles.groupName}>{`Klasse: ${student.groupName ?? "–"}`}</Text>

          <Text style={styles.sectionTitle}>Zugeteilte Module</Text>
          {student.modules.length === 0 ? (
            <Text style={styles.emptyText}>Keine Module zugeteilt.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.row}>
                <View style={styles.moduleCell}>
                  <Text style={styles.headerCellText}>Modul</Text>
                </View>
                <View style={styles.scheduleCell}>
                  <Text style={styles.headerCellText}>Datum</Text>
                </View>
                <View style={styles.categoryCell}>
                  <Text style={styles.headerCellText}>Kategorie</Text>
                </View>
                <View style={styles.teacherCell}>
                  <Text style={styles.headerCellText}>Lehrer</Text>
                </View>
              </View>
              {student.modules.map((module, moduleIndex) => (
                <View key={moduleIndex} style={styles.row}>
                  <View style={styles.moduleCell}>
                    <Text style={styles.cellText}>{module.name}</Text>
                  </View>
                  <View style={styles.scheduleCell}>
                    <Text style={styles.cellText}>{module.displayScheduleLabel ?? "–"}</Text>
                  </View>
                  <View style={styles.categoryCell}>
                    <Text style={styles.cellText}>
                      {module.categoryNames.length > 0 ? module.categoryNames.join(", ") : "–"}
                    </Text>
                  </View>
                  <View style={styles.teacherCell}>
                    <Text style={styles.cellText}>{module.teacher ?? "–"}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Page>
      ))}
    </Document>
  );
}
