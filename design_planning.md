Ich brauche einen ersten Prototypen für die WebUI von "modulocate". Du finndest eine kurze Idee der App in planning.md. Es ist quasi eine Vollfertige Software zum Verteilen von Wahlmodulen an einer Schule. Die App bzw das System besteht aus 5 Phasen, diese sollten von 1 bis 5 nummeriert jeweils Links mittig in einer Sidebar angezeigt werden.
1. Daten
2. Umfrage
3. Zuteilung
4. Anpassungen
5. Ergebnisse

Ganz oben von der Sidebar sollte man den Namen des aktuellen Projekt sehen, bzw wechseln können. Über ein drop down menü.Unten von der Sidebar sollte der Account des nutzers zu sehen sein. Von dort kommt der Nutzer auch auf seine Account seite.Neben der Sidebar gibt es auch immer eine Navbar oben, diese Zeit aber jeweils die Seitenauswahl der aktuell ausgewählten Phase bzw Seite.Da es ja nur ein Prototyp ist, muss noch nicht alles bis zum Ende durch bauen. Hier aber vllt paar sachen die rein sollten:

1. Phase: Daten
Hier legt der User verschiedene Daten an, wie z.B Module oder die Schüler die Teilnehmen.Für jeden haupt-Datentyp sollte es oben in der Navbar ein Punkt geben. Die meisten Datentypen werden einfach als Grid dargestellt, außer Schüler, hier bietet sich eine Liste ehr an.

2. Phase: Umfrage
Hier kann der Admin die Wahl starten. Dann werden alle Vote Mails an die Schüler verschickt. Er sollte einen großen "Umfrage starten" Button sehen. Er wird gewarnt sobald er diesen Drückt, da ab dann die Module nicht mehr angepasst werden können.Er sollte hier außerdem die Liste der Schüler mit dem Voting Status sehen, also z.B: ob diese schon gevotet haben oder noch nicht, deren vote-links direkt abrufen können. Und zur Kontrolle auch einsehen können wie diese abgestimmt haben.Der Knopf sollte nach starten der Wahl entsprechend auch wieder ermöglichen diese zu schließen

3. Phase: Zuteilung
Hier sollte der User die Möglichkeit haben, den Modul Algorithmus mit verschiedenen Werten starten zu können. Er sollte mehrere Durchläufe starten können und sich am ende einen basierend auf tags aussuchen.

4. Phase: Anpassung
Wie der Name schon sagt kann der User hier letzte Anpassungen an dem festgelegten Datensatz vornehmen. Dazu gehört vorallem Schüler eventuell noch händisch zuzuteilen, falls nicht alle ein Modul bekommen haben. Dazu wäre auch wieder verschiedene Analyse ansichten gut, bei dem man auch die Auslastung der Verschiedenen Module sieht und sehen kann, ob alle genügend Module bekommen haben.

5. Phase: Ergebnisse
Diese Phase beinhaltet den finalen Lock-In. Der Datensatz ist damit festgelegt und kann im System nicht mehr bearbeitet werden. Der Admin kann dann über einen Knopf die Ergebnisse verschicken. Die Ergebnisse können außerdem in verschiedenen Formaten exportiert werden. 