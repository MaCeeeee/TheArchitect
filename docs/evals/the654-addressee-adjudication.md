# THE-654 — Adjudikation: hat diese Bestimmung einen Adressaten?

**Erzeugt am 2026-08-10** aus 1750 Korpus-Bestimmungen · 423 ohne Adressatenklasse
· davon 123 mit Sachtitel (Verdacht) und 133 Rahmenbestimmungen.
Stichprobe: **30** über **14** Gesetze, plus **5** Gegenproben.

> Erzeugt von `packages/server/src/scripts/the654-addressee-sample.ts` — derselbe Lauf ergibt denselben Bogen.

## Aus welcher Blickrichtung?

**Aus der Sicht der Norm — nicht aus der Sicht unseres Kunden.** Gefragt ist, wen der Satz verpflichtet,
*wer immer das ist*: auch die Kommission, ein Mitgliedstaat, eine Aufsichtsbehörde oder eine
Normungsorganisation.

Der Kunde kommt erst eine Stufe später ins Spiel. Seine Selbstauskunft („wir sind Verantwortlicher und
Auftragsverarbeiter") wird gegen die hier bestimmte Norm-Rolle gehalten; erst dieser Abgleich entscheidet
über Anwendbarkeit. Der Bogen liefert die eine Seite, das Unternehmensprofil die andere.

Dass es so gemeint ist, steht in den Daten: **46 %** der 1324 getypten Bestimmungen tragen heute
`member_state`, `supervisory_authority` oder `data_subject` — Rollen, die kein Unternehmen je über sich
selbst erklärt. Wäre die Kundensicht gemeint, dürften diese Rollen gar nicht im Katalog stehen.

**Warum das auch dann zählt, wenn nie ein Kunde gemeint ist:** „Dieser Artikel bindet die Kommission" ist
eine *Antwort* — „wir wissen es nicht" ist keine. Nur die erste darf zu „betrifft dich nicht" werden;
Nichtwissen als Entwarnung auszugeben ist die gefährliche Fehlerrichtung.

## Die vier Urteile

| | Bedeutung | Was daraus folgt |
|---|---|---|
| **A** | Adressat vorhanden — **und seine Rolle steht im Katalog unten** | Die Typisierung hat ihn übersehen. Extraktions-Problem, kein Katalog-Problem. |
| **B** | Adressat vorhanden — **aber seine Rolle fehlt im Katalog** | Der gesuchte Fall. Bitte im Feld darunter benennen, wie er heißen müsste. |
| **C** | **Kein** Normadressat — die Bestimmung richtet sich an niemanden (Verfahren, Definition, Schlussbestimmung) | Korrekt leer. |
| **D** | unklar / mehrdeutig | Zählt als eigene Klasse, nicht als Nein. |

**Dazu, unabhängig vom Urteil: „mehr als ein Adressat?"** Das ist *kein fünftes Urteil*, sondern eine
zweite Frage — sie kann bei jedem Buchstaben zutreffen. Die Typisierung darf heute nur **eine** Rolle je
Bestimmung eintragen. Ein Artikel, der Mitgliedstaaten **und** Anbieter verpflichtet, hat beide Rollen im Katalog
und landet damit auf **A** — „übersehen". Übersehen wurde aber nichts; es war kein Platz. Ohne diese Zeile
verschwindet ein Schema-Problem unbemerkt als Extraktions-Problem. Bei mehreren bitte **alle** Adressaten
nennen, durch Komma getrennt.

**Die Leitfrage:** *Wen verpflichtet dieser Artikel — wer muss danach etwas tun oder lassen?*
Nicht: wovon handelt er. Ein Artikel über Normungsaufträge verpflichtet die Normungsorganisation,
auch wenn das Wort „Pflicht" nicht vorkommt.

Deshalb ist ein Artikel, der *nur* EU-Organe verpflichtet, **B** — Adressat vorhanden, seine Rolle fehlt im Katalog —
und nicht **C**. **C** ist ausschließlich für Sätze, die *niemanden* verpflichten.

## Der Rollenkatalog heute (19 Einträge)

Eine **geschlossene Liste**, wie ein Actor/Role-Katalog in TOGAF Phase B. Beim Typisieren darf jede
Bestimmung nur einen dieser 19 Werte bekommen — oder gar keinen. Erfinden ist verboten, und genau
deshalb prüfen wir hier, ob die Liste zu kurz ist. *Diese Liste ist gemeint, wenn im Bogen vom „Katalog"
die Rede ist* — nicht das Sachgebiet des Artikels.

```
member_state · supervisory_authority · financial_entity · provider · manufacturer
controller · conformity_assessment_body · trust_service_provider · obligated_enterprise
data_holder · ict_third_party_provider · essential_important_entity · processor
data_subject · ecs_provider · importer · distributor · authorized_representative · deployer
```

## Warum die Gegenproben mitlaufen

Die 5 Fälle am Ende stammen aus den 133 Rahmenbestimmungen — sie sollten **C** ergeben.
Tun sie es nicht, trennt die Titel-Heuristik nicht, was sie zu trennen vorgibt, und die Zahl
„123 Verdachtsfälle" ist selbst fragwürdig. Sie sind als *(Gegenprobe)* markiert, damit
beim Auswerten klar ist, welche Rolle sie spielen — ihre Antwort ist trotzdem offen.

---

## Stichprobe

### 01 · ai-act-de · Art. 56

**Praxisleitfäden**

> (1) Das Büro für Künstliche Intelligenz fördert und erleichtert die Ausarbeitung von Praxisleitfäden auf Unionsebene, um unter Berücksichtigung internationaler Ansätze zur ordnungsgemäßen Anwendung dieser Verordnung beizutragen. (2) Das Büro für Künstliche Intelligenz und das KI-Gremium streben an, sicherzustellen, dass die Praxisleitfäden mindestens die in den Artikeln 53 und 55 vorgesehenen Pflichten abdecken, einschließlich der folgenden Aspekte: a) Mittel, mit denen sichergestellt wird, dass die in Artikel 53 Absatz 1 Buchstaben a und b genannten Informationen vor dem Hintergrund der Marktentwicklungen und technologischen Entwicklungen auf dem neuesten Stand gehalten werden; b) die angem…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur…
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`ai-act-de:art-56`</sub>

---

### 02 · cra-de · Art. 14

**Meldepflichten der Hersteller**

> (1) Ein Hersteller meldet jede aktiv ausgenutzte Schwachstelle, die in dem Produkt mit digitalen Elementen enthalten ist und von der er Kenntnis erlangt, gleichzeitig dem gemäß Absatz 7 als Koordinator benannten CSIRT und der ENISA. Der Hersteller meldet diese aktiv ausgenutzte Schwachstelle über die gemäß Artikel 16 eingerichtete einheitliche Meldeplattform. (2) Für die Zwecke der Mitteilung gemäß Absatz 1 legt der Hersteller Folgendes vor: a) unverzüglich, in jedem Fall aber innerhalb von 24 Stunden, nachdem der Hersteller davon Kenntnis erlangt hat, eine Frühwarnung über eine aktiv ausgenutzte Schwachstelle unter Angabe der Mitgliedstaaten, in deren Hoheitsgebiet das Produkt mit digitalen…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da…
>
> *(2)* Mit dieser Verordnung sollen die Rahmenbedingungen für die Entwicklung sicherer Produkte mit digitalen Elementen geschaffen werden, damit Hardware- und Softwareprodukte mit weniger Schwachstellen in den Verkehr gebracht werden und damit sich die Hersteller während des gesamten Lebenszyklus eines Produkts konsequent um die Sicherheit kümmern. Außerdem sollen Bedingungen geschaffen werden, die es den Nutzern ermöglichen, bei der Auswahl und Verwendung von Produkten mit digitalen Elementen die Cybersicherheit zu berücksichtigen, beispielsweise durch mehr Transparenz in Bezug auf den Unterstützungszeitraum für auf dem Markt bereitgestellte Produkte mit digitalen Elementen.
>
> *(3)* Das geltende einschlägige Unionsrecht umfasst mehrere horizontale Vorschriften, die bestimmte Aspekte der Cybersicherheit aus unterschiedlichen Blickwinkeln regeln, darunter auch Maßnahmen zur Erhöhung der Sicherheit der digitalen Lieferkette. Das bestehende Unionsrecht in Bezug auf die Cybersicherheit, wozu die Verordnung (EU) 2019/881 des Europäischen Parlaments und des Rates (3) und die Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates (4) gehören, enthält jedoch keine unmittelbar verbindlichen Anforderungen an die Sicherheit von Produkten mit digitalen Elementen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`cra-de:art-14`</sub>

---

### 03 · data-act-de · Art. 12

**Umfang der Pflichten der Dateninhaber, die nach dem Unionsrecht verpflichtet sind, Daten bereitzustellen**

> (1) Dieses Kapitel gilt, wenn ein Dateninhaber im Rahmen von Geschäftsbeziehungen zwischen Unternehmen nach Artikel 5 oder nach geltendem Unionsrecht oder nach im Einklang mit Unionsrecht erlassenen nationalen Rechtsvorschriften verpflichtet ist, einem Datenempfänger Daten bereitzustellen. (2) Eine Vertragsklausel in einer Datenweitergabevereinbarung, die zum Nachteil einer Partei oder gegebenenfalls zum Nachteil des Nutzers die Anwendung dieses Kapitels ausschließt, davon abweicht oder seine Wirkung abändert, ist für diese Partei nicht bindend. KAPITEL IV MISSBRÄUCHLICHE VERTRAGSKLAUSELN IN BEZUG AUF DEN DATENZUGANG UND DIE DATENNUTZUNG ZWISCHEN UNTERNEHMEN

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In den letzten Jahren haben datengetriebene Technologien transformative Wirkung auf alle Wirtschaftssektoren gehabt. Insbesondere die rasche Verbreitung von Produkten, die mit dem Internet vernetzt sind, hat den Umfang und den potenziellen Wert von Daten für Verbraucher, Unternehmen und Gesellschaft erhöht. Hochwertige und interoperable Daten aus verschiedenen Bereichen steigern die Wettbewerbsfähigkeit und Innovation und sorgen für ein nachhaltiges Wirtschaftswachstum. Dieselben Daten können unbegrenzt für verschiedene Zwecke verwendet und weiterverwendet werden, ohne dass dadurch Qualität oder Quantität beeinträchtigt wird.
>
> *(2)* Hindernisse bei der Datenweitergabe verhindern jedoch eine optimale Verteilung der Daten zum Nutzen der Gesellschaft. Zu diesen Hindernissen gehören der Mangel an Anreizen für Dateninhaber, freiwillig Vereinbarungen über die Datenweitergabe einzugehen, Unsicherheiten in Bezug auf Rechte und Pflichten in Verbindung mit Daten, die Kosten der Auftragsvergabe in Bezug auf technische Schnittstellen und für deren Einrichtung, die starke Fragmentierung von Informationen in Datensilos, die schlechte Verwaltung von Metadaten, fehlende Normen für die semantische und technische Interoperabilität, Engpässe beim Datenzugang, das Fehlen einheitlicher Verfahren für die Datenweitergabe und der Missbrauch vertraglicher Ungleichgewichte hinsichtlich Datenzugang und Datennutzung.
>
> *(3)* In Sektoren mit zahlreichen Kleinstunternehmen sowie Kleinunternehmen und mittleren Unternehmen im Sinne von Artikel 2 des Anhangs der Empfehlung 2003/361/EG der Kommission (5) (KMU) mangelt es häufig an digitalen Kapazitäten und Kompetenzen für die Erhebung, Analyse und Nutzung von Daten; zudem ist der Zugang oftmals eingeschränkt, weil ein einziger Akteur im System die Daten hält oder weil Daten oder Datendienste an sich bzw. über Grenzen hinweg nicht interoperabel sind.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`data-act-de:art-12`</sub>

---

### 04 · dora-de · Art. 41

**Harmonisierung der Voraussetzungen für die Durchführung der Überwachungstätigkeiten**

> (1) Die ESA arbeiten über den Gemeinsamen Ausschuss Entwürfe technischer Regulierungsstandards aus, um Folgendes festzulegen: a) die Informationen, die von einem IKT-Drittdienstleister in dem Antrag bereitzustellen sind, in dem gemäß Artikel 31 Absatz 11 freiwillig um Einstufung als kritisch ersucht wird; b) Inhalt, Struktur und Format der Informationen, die IKT-Drittdienstleister gemäß Artikel 35 Absatz 1 übermitteln, offenlegen und melden müssen, einschließlich der Vorlage für die Bereitstellung von Informationen über die Vereinbarungen über die Unterauftragsvergabe; c) die Kriterien für die Festlegung der Zusammensetzung des gemeinsamen Untersuchungsteams, bei der eine ausgewogene Beteili…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Informations- und Kommunikationstechnologien (IKT) unterstützen im digitalen Zeitalter komplexe Systeme, die für alltägliche Aktivitäten eingesetzt werden. Sie sorgen dafür, dass Schlüsselsektoren unserer Volkswirtschaften, einschließlich des Finanzsektors, am Laufen gehalten werden, und verbessern das Funktionieren des Binnenmarkts. Die zunehmende Digitalisierung und Vernetzung verstärken auch das IKT-Risiko, das die Gesellschaft insgesamt — und insbesondere das Finanzsystem — anfälliger für Cyberbedrohungen oder IKT-Störungen macht. Während die allgegenwärtige Nutzung von IKT-Systemen und die hohe Digitalisierung und Konnektivität heute grundlegende Merkmale der Tätigkeiten von Finanzunternehmen der Union sind, muss ihre digitale Resilienz erst noch besser angegangen und in ihre allgemeinen operativen Rahmen integriert werden.
>
> *(2)* Die Nutzung von IKT hat in den letzten Jahrzehnten einen derart zentralen Stellenwert bei der Erbringung von Finanzdienstleistungen erlangt, dass sie heute entscheidend zur Ausführung typischer alltäglicher Aufgaben aller Finanzunternehmen beiträgt. Auf Digitalisierung beruhen heute beispielsweise Zahlungen, die von bargeld- und papiergestützten Methoden zunehmend auf die Nutzung digitaler Lösungen verlagert wurden, sowie Wertpapierclearing und -abrechnungssysteme, elektronischer und algorithmischer Handel, Darlehens- und Finanzierungsgeschäfte, Peer-to-Peer-Finanzierung, Bonitätseinstufung, Schadensmanagement und Back-Office-Transaktionen. Auch der Versicherungssektor hat sich durch den Einsatz von IKT verändert — vom Aufkommen digitaler Versicherungsvermittler, die ihre Dienste online anbieten und mit InsurTech arbeiten, bis hin zu digitalen Versicherungsgeschäften. Das Finanzwesen ist nicht nur sektorweit weitgehend digital geworden, sondern die Digitalisierung hat auch die Verflechtungen und Abhängigkeiten innerhalb des Finanzsektors sowie von Infrastrukturen Dritter und Drittdienstleistern verstärkt.
>
> *(3)* Der Europäische Ausschuss für Systemrisiken (ESRB) bekräftigte in einem Bericht aus dem Jahr 2020 über systemische Cyberrisiken, wie das bestehende hohe Maß an Verflechtungen zwischen Finanzunternehmen, Finanzmärkten und Finanzmarktinfrastrukturen und insbesondere die gegenseitigen Abhängigkeiten ihrer IKT-Systeme eine Systemanfälligkeit herbeiführen könnten, da lokalisierte Cybervorfälle in einem der rund 22 000 Finanzunternehmen der Union über geografische Grenzen hinweg rasch auf das gesamte Finanzsystem übergreifen könnten. Schwerwiegende IKT-Sicherheitsverletzungen, die im Finanzsektor auftreten können, betreffen nicht nur Finanzunternehmen, die isoliert betrachtet werden. Ebenso können sich hierdurch ermittelte Schwachstellen über die Übertragungskanäle des Finanzsystems verbreiten und die Stabilität des Finanzsystems der Union beeinträchtigen, etwa durch Liquiditätsengpässe und einen allgemeinen Verlust des Vertrauens in die Finanzmärkte.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dora-de:art-41`</sub>

---

### 05 · dsgvo-en · Art. 48

**Transfers or disclosures not authorised by Union law**

> Any judgment of a court or tribunal and any decision of an administrative authority of a third country requiring a controller or processor to transfer or disclose personal data may only be recognised or enforceable in any manner if based on an international agreement, such as a mutual legal assistance treaty, in force between the requesting third country and the Union or a Member State, without prejudice to other grounds for transfer pursuant to this Chapter.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* The protection of natural persons in relation to the processing of personal data is a fundamental right. Article 8(1) of the Charter of Fundamental Rights of the European Union (the ‘Charter’) and Article 16(1) of the Treaty on the Functioning of the European Union (TFEU) provide that everyone has the right to the protection of personal data concerning him or her.
>
> *(2)* The principles of, and rules on the protection of natural persons with regard to the processing of their personal data should, whatever their nationality or residence, respect their fundamental rights and freedoms, in particular their right to the protection of personal data. This Regulation is intended to contribute to the accomplishment of an area of freedom, security and justice and of an economic union, to economic and social progress, to the strengthening and the convergence of the economies within the internal market, and to the well-being of natural persons.
>
> *(3)* Directive 95/46/EC of the European Parliament and of the Council (4) seeks to harmonise the protection of fundamental rights and freedoms of natural persons in respect of processing activities and to ensure the free flow of personal data between Member States.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dsgvo-en:art-48`</sub>

---

### 06 · eidas-de · Art. 26

**Anforderungen an fortgeschrittene elektronische Signaturen**

> Eine fortgeschrittene elektronische Signatur erfüllt alle folgenden Anforderungen: a) Sie ist eindeutig dem Unterzeichner zugeordnet. b) Sie ermöglicht die Identifizierung des Unterzeichners. c) Sie wird unter Verwendung elektronischer Signaturerstellungsdaten erstellt, die der Unterzeichner mit einem hohen Maß an Vertrauen unter seiner alleinigen Kontrolle verwenden kann. d) Sie ist so mit den auf diese Weise unterzeichneten Daten verbunden, dass eine nachträgliche Veränderung der Daten erkannt werden kann.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die wirtschaftliche und soziale Entwicklung setzt Vertrauen in das Online-Umfeld voraus. Mangelndes Vertrauen führt dazu, dass Verbraucher, Unternehmen und öffentliche Verwaltungen nur zögerlich elektronische Transaktionen durchführen oder neue Dienste einführen bzw. nutzen, vor allem, wenn sie die Befürchtung hegen, dass es an Rechtssicherheit mangelt.
>
> *(2)* Diese Verordnung dient der Stärkung des Vertrauens in elektronische Transaktionen im Binnenmarkt, indem eine gemeinsame Grundlage für eine sichere elektronische Interaktion zwischen Bürgern, Unternehmen und öffentlichen Verwaltungen geschaffen wird, wodurch die Effektivität öffentlicher und privater Online-Dienstleistungen, des elektronischen Geschäftsverkehrs und des elektronischen Handels in der Union erhöht wird.
>
> *(3)* Die Richtlinie 1999/93/EG des Europäischen Parlaments und des Rates (3) hat Regelungen zu elektronischen Signaturen festgelegt, ohne einen umfassenden grenz- und sektorenübergreifenden Rahmen für sichere, vertrauenswürdige und einfach zu nutzende elektronische Transaktionen zu schaffen. Die vorliegende Verordnung stärkt und erweitert die Rechtsvorschriften jener Richtlinie.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`eidas-de:art-26`</sub>

---

### 07 · emoney-de · Art. 13

**Außergerichtliche Beschwerdeverfahren und Streitbeilegungsverfahren**

> Unbeschadet dieser Richtlinie gilt Titel IV Kapitel 5 der Richtlinie 2007/64/EG für E-Geld-Emittenten hinsichtlich der ihnen aus diesem Titel erwachsenden Verpflichtungen entsprechend. TITEL IV SCHLUSSBESTIMMUNGEN UND DURCHFÜHRUNGSMASSNAHMEN

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Richtlinie 2000/46/EG des Europäischen Parlaments und des Rates vom 18. September 2000 über die Aufnahme, Ausübung und Beaufsichtigung der Tätigkeit von E-Geld-Instituten (4) wurde in Reaktion auf die Entstehung neuer Arten von vorausbezahlten elektronischen Zahlungsmitteln erlassen und sollte einen klaren Rechtsrahmen abstecken, um den Binnenmarkt zu stärken und gleichzeitig eine angemessene Finanzaufsicht zu gewährleisten.
>
> *(2)* Die Kommission hob in ihrer Überprüfung der Richtlinie 2000/46/EG hervor, dass die Richtlinie geändert werden muss, da einige ihrer Bestimmungen die Entstehung eines echten Binnenmarkts für E-Geld-Dienstleistungen und die Entwicklung dieser benutzerfreundlichen Dienstleistungen offenbar verhindert haben.
>
> *(3)* Mit der Richtlinie 2007/64/EG des Europäischen Parlaments und des Rates vom 13. November 2007 über Zahlungsdienste im Binnenmarkt (5) wurde ein moderner und kohärenter Rechtsrahmen für Zahlungsdienste eingeführt, der auch die Abstimmung der nationalen Vorschriften für die aufsichtsrechtlichen Anforderungen an eine neue Kategorie von Zahlungsdienstleistern, die Zahlungsinstitute, vorsieht.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`emoney-de:art-13`</sub>

---

### 08 · eprivacy-en · Art. 3

**Services concerned**

> 1\. This Directive shall apply to the processing of personal data in connection with the provision of publicly available electronic communications services in public communications networks in the Community. 2\. Articles 8, 10 and 11 shall apply to subscriber lines connected to digital exchanges and, where technically possible and if it does not require a disproportionate economic effort, to subscriber lines connected to analogue exchanges. 3\. Cases where it would be technically impossible or require a disproportionate economic effort to fulfil the requirements of Articles 8, 10 and 11 shall be notified to the Commission by the Member States.

*Erwägungsgründe dieser Sprachfassung liegen noch nicht im Korpus vor.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`eprivacy-en:art-3`</sub>

---

### 09 · esg-rating-de · Art. 5

**Befristete Regelung für kleine ESG-Rating-Anbieter**

> (1) Abweichend von Artikel 4 unterliegt ein als kleines Unternehmen oder als kleine Gruppe im Sinne von Artikel 3 Absatz 2 Unterabsatz 1 bzw. Artikel 3 Absatz 5 Unterabsatz 1 der Richtlinie 2013/34/EU eingestufter ESG-Rating-Anbieter (im Folgenden „kleiner ESG-Rating-Anbieter“), der in der Union niedergelassen ist und in der Union tätig werden möchte, nur Artikel 15 Absätzen 1, 5 und 7, Artikel 23 und 24 sowie den Artikeln 32 bis 37 der vorliegenden Verordnung, sofern er a) der ESMA seine Absicht mitteilt, in der Union tätig zu werden und b) von der ESMA vor Aufnahme seine Tätigkeit in der Union registriert wurde. (2) Innerhalb von 90 Arbeitstagen nach Eingang der in Absatz 1 Buchstabe a gen…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Am 25. September 2015 verabschiedete die Generalversammlung der Vereinten Nationen einen neuen globalen Rahmen zur nachhaltigen Entwicklung: die Agenda 2030 für nachhaltige Entwicklung (im Folgenden „Agenda 2030“), deren Kernstück die Ziele für nachhaltige Entwicklung sind. Die Mitteilung der Kommission vom 22. November 2016 mit dem Titel „Auf dem Weg in eine nachhaltige Zukunft: Europäische Nachhaltigkeitspolitik“ bindet die Nachhaltigkeitsziele in den politischen Rahmen der Union ein, um sicherzustellen, dass alle innen- und außenpolitischen Maßnahmen und Initiativen der Union diese Ziele von Beginn an mitberücksichtigen. In den Schlussfolgerungen des Europäischen Rates vom 22. und 23. Juni 2017 wurde die Entschlossenheit der Union und der Mitgliedstaaten bekräftigt, die Agenda 2030 vollständig, kohärent, umfassend, integrativ und wirksam und in enger Zusammenarbeit mit den Partnern und anderen Akteuren umzusetzen. Darüber hinaus haben zum Zeitpunkt des Erlasses dieser Verordnung über 5 300 Personen die von den Vereinten Nationen unterstützten Grundsätze für verantwortungsbewusstes Investment unterzeichnet, die ein verwaltetes Vermögen von über 120 Billionen EUR repräsentieren. D…
>
> *(2)* Der Übergang zu einer nachhaltigen Wirtschaft ist von entscheidender Bedeutung, um die langfristige Wettbewerbsfähigkeit und Nachhaltigkeit der Wirtschaft der Union und die Lebensqualität der Bürgerinnen und Bürger in der Union sicherzustellen und die Erderwärmung deutlich unter der 1,5-Grad-Grenze zu halten. Die nachhaltige Entwicklung steht seit vielen Jahren im Mittelpunkt der Unionspolitik, und ihre soziale und umweltpolitische Dimension wird im Vertrag über die Europäische Union und im Vertrag über die Arbeitsweise der Europäischen Union anerkannt.
>
> *(3)* Um die Ziele der Ziele für eine nachhaltige Entwicklung in der Union zu erreichen, müssen die Kapitalflüsse in nachhaltige Investitionen gelenkt werden. Zur Erreichung dieser Ziele ist es notwendig, das Potenzial des Binnenmarkts in vollem Umfang auszuschöpfen. In diesem Zusammenhang ist es entscheidend, Hindernisse für die effiziente Lenkung von Kapital hin zu nachhaltigen Investitionen im Binnenmarkt zu beseitigen, die Entstehung solcher Hindernisse zu verhindern und Regeln und Standards festzulegen, um einerseits nachhaltige Finanzierungen zu fördern und andererseits Investitionen zu bremsen, die sich nachteilig auf die Verwirklichung der Ziele für eine nachhaltige Entwicklung auswirken können.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`esg-rating-de:art-5`</sub>

---

### 10 · lksg · § 11

**Besondere Prozessstandschaft**

> (1) Wer geltend macht, in einer überragend wichtigen geschützten Rechtsposition aus § 2 Absatz 1 verletzt zu sein, kann zur gerichtlichen Geltendmachung seiner Rechte einer inländischen Gewerkschaft oder Nichtregierungsorganisation die Ermächtigung zur Prozessführung erteilen. (2) Eine Gewerkschaft oder Nichtregierungsorganisation kann nach Absatz 1 nur ermächtigt werden, wenn sie eine auf Dauer angelegte eigene Präsenz unterhält und sich nach ihrer Satzung nicht gewerbsmäßig und nicht nur vorübergehend dafür einsetzt, die Menschenrechte oder entsprechende Rechte im nationalen Recht eines Staates zu realisieren.

*Erwägungsgründe dieser Sprachfassung liegen noch nicht im Korpus vor.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`lksg:11`</sub>

---

### 11 · mdr-de · Art. 112

**Finanzierung der Tätigkeiten im Zusammenhang mit der Benennung und Überwachung der Benannten Stellen**

> Die Kommission erstattet die bei den gemeinsamen Bewertungstätigkeiten anfallenden Kosten. Sie legt im Wege von Durchführungsrechtsakten den Umfang und die Struktur der erstattungsfähigen Kosten und andere erforderliche Durchführungsvorschriften fest. Diese Durchführungsrechtsakte werden gemäß dem in Artikel 114 Absatz 3 genannten Prüfverfahren erlassen.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Der EU-Rechtsrahmen für Medizinprodukte — mit Ausnahme von In-vitro-Diagnostika — besteht aus der Richtlinie 90/385/EWG des Rates (3) und der Richtlinie 93/42/EWG des Rates (4). Um einen soliden, transparenten, berechenbaren und nachhaltigen Rechtsrahmen für Medizinprodukte zu schaffen, der ein hohes Niveau an Sicherheit und Gesundheitsschutz gewährleistet, gleichzeitig aber innovationsfördernd wirkt, ist jedoch eine grundlegende Überarbeitung dieser Richtlinien erforderlich.
>
> *(2)* Ausgehend von einem hohen Gesundheitsschutzniveau für Patienten und Anwender soll mit der vorliegenden Verordnung ein reibungslos funktionierender Binnenmarkt für Medizinprodukte unter Berücksichtigung der in diesem Sektor tätigen kleinen und mittleren Unternehmen sichergestellt werden. Außerdem sind in dieser Verordnung hohe Standards für die Qualität und Sicherheit von Medizinprodukten festgelegt, durch die allgemeine Sicherheitsbedenken hinsichtlich dieser Produkte ausgeräumt werden sollen. Die beiden Ziele werden parallel verfolgt; sie sind untrennbar miteinander verbunden und absolut gleichrangig. Gestützt auf Artikel 114 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) wird mit dieser Verordnung eine Harmonisierung der Rechtsvorschriften für das Inverkehrbringen und die Inbetriebnahme von Medizinprodukten und ihrem Zubehör auf dem Unionsmarkt vorgenommen, denen dadurch der Grundsatz des freien Warenverkehrs zugute kommen kann. Im Sinne von Artikel 168 Absatz 4 Buchstabe c AEUV werden mit dieser Verordnung hohe Standards für Qualität und Sicherheit der Medizinprodukte festgelegt, indem unter anderem dafür gesorgt wird, dass die im Rahmen klinischer Prüfungen ge…
>
> *(3)* Mit dieser Verordnung sollen nicht die Vorschriften harmonisiert werden, die die weitere Bereitstellung auf dem Markt von bereits in Betrieb genommenen Medizinprodukten, etwa im Zusammenhang mit dem Verkauf gebrauchter Produkte, betreffen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`mdr-de:art-112`</sub>

---

### 12 · nis2 · Art. 4

**Sector-specific Union legal acts**

> 1. Where sector-specific Union legal acts require essential or important entities to adopt cybersecurity risk-management measures or to notify significant incidents and where those requirements are at least equivalent in effect to the obligations laid down in this Directive, the relevant provisions of this Directive, including the provisions on supervision and enforcement laid down in Chapter VII, shall not apply to such entities. Where sector-specific Union legal acts do not cover all entities in a specific sector falling within the scope of this Directive, the relevant provisions of this Directive shall continue to apply to the entities not covered by those sector-specific Union legal acts…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Directive (EU) 2016/1148 of the European Parliament and the Council (4) aimed to build cybersecurity capabilities across the Union, mitigate threats to network and information systems used to provide essential services in key sectors and ensure the continuity of such services when facing incidents, thus contributing to the Union’s security and to the effective functioning of its economy and society.
>
> *(2)* Since the entry into force of Directive (EU) 2016/1148, significant progress has been made in increasing the Union’s level of cyber resilience. The review of that Directive has shown that it has served as a catalyst for the institutional and regulatory approach to cybersecurity in the Union, paving the way for a significant change in mind-set. That Directive has ensured the completion of national frameworks on the security of network and information systems by establishing national strategies on security of network and information systems and establishing national capabilities and by implementing regulatory measures covering essential infrastructures and entities identified by each Member State. Directive (EU) 2016/1148 has also contributed to cooperation at Union level through the establishment of the Cooperation Group and the network of national computer security incident response teams. Notwithstanding those achievements, the review of Directive (EU) 2016/1148 has revealed inherent shortcomings that prevent it from addressing effectively current and emerging cybersecurity challenges.
>
> *(3)* Network and information systems have developed into a central feature of everyday life with the speedy digital transformation and interconnectedness of society, including in cross-border exchanges. That development has led to an expansion of the cyber threat landscape, bringing about new challenges, which require adapted, coordinated and innovative responses in all Member States. The number, magnitude, sophistication, frequency and impact of incidents are increasing, and present a major threat to the functioning of network and information systems. As a result, incidents can impede the pursuit of economic activities in the internal market, generate financial loss, undermine user confidence and cause major damage to the Union’s economy and society. Cybersecurity preparedness and effectiveness are therefore now more essential than ever to the proper functioning of the internal market. Moreover, cybersecurity is a key enabler for many critical sectors to successfully embrace the digital transformation and to fully grasp the economic, social and sustainable benefits of digitalisation.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`nis2:art-4`</sub>

---

### 13 · psd2-de · Art. 4

**Begriffsbestimmungen**

> Für die Zwecke dieser Richtlinie bezeichnet der Ausdruck: 1. „Herkunftsmitgliedstaat“ a) den Mitgliedstaat, in dem sich der Sitz des Zahlungsdienstleisters befindet, oder b) wenn der Zahlungsdienstleister nach dem für ihn geltenden nationalen Recht keinen Sitz hat, den Mitgliedstaat, in dem sich seine Hauptverwaltung befindet; 2. „Aufnahmemitgliedstaat“ den Mitgliedstaat, in dem ein Zahlungsdienstleister einen Agenten oder eine Zweigniederlassung hat oder Zahlungsdienste erbringt und der nicht der Herkunftsmitgliedstaat dieses Zahlungsdienstleisters ist; 3. „Zahlungsdienst“ eine oder mehrere der in Anhang I aufgeführten gewerblichen Tätigkeiten; 4. „Zahlungsinstitut“ eine juristische Person,…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In den letzten Jahren sind bei der Integration von Massenzahlungen in der Union erhebliche Fortschritte erzielt worden, insbesondere im Zusammenhang mit den Rechtsakten der Union zum Zahlungsverkehr, und hier vor allem durch die Richtlinie 2007/64/EG des Europäischen Parlaments und des Rates (4), die Verordnung (EG) Nr. 924/2009 des Europäischen Parlaments und des Rates (5), die Richtlinie 2009/110/EG des Europäischen Parlaments und des Rates (6) sowie die Verordnung (EU) Nr. 260/2012 des Europäischen Parlaments und des Rates (7). Mit der Richtlinie 2011/83/EU des Europäischen Parlaments und des Rates (8) wurde der Rechtsrahmen für Zahlungsdienste weiter ergänzt, indem durch die Festlegung einer bestimmten Obergrenze die Fähigkeit der Einzelhändler, ihren Kunden für die Nutzung eines bestimmten Zahlungsmittels einen Aufschlag zu berechnen, eingeschränkt wurde.
>
> *(2)* Der überarbeitete Rechtsrahmen der Union für Zahlungsdienste wird durch die Verordnung (EU) 2015/751 des Europäischen Parlaments und des Rates (9) ergänzt. Mit jener Verordnung werden insbesondere Vorschriften über das Erheben von Interbankenentgelten für kartengebundene Zahlungsvorgänge eingeführt und es wird bezweckt, die Vollendung eines tatsächlich integrierten Marktes für kartengebundene Zahlungen weiter zu beschleunigen.
>
> *(3)* Die Richtlinie 2007/64/EG wurde im Dezember 2007 auf der Grundlage eines Kommissionsvorschlags vom Dezember 2005 angenommen. Seitdem hat der Markt für Massenzahlungsverkehr bedeutende technische Innovationen erfahren, die mit einem raschen zahlenmäßigen Wachstum der elektronischen und mobilen Zahlungen und mit dem Aufkommen neuer Arten von Zahlungsdiensten am Markt einhergingen, die eine Herausforderung für den derzeit geltenden Rahmen darstellen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`psd2-de:art-4`</sub>

---

### 14 · standardisation-de · Art. 10

**Normungsaufträge für europäische Normungsorganisationen**

> (1) Die Kommission kann im Rahmen ihrer in den Verträgen festgelegten Befugnisse ein oder mehrere europäische Normungsorganisationen damit beauftragen, innerhalb einer vorgegebenen Frist eine europäische Norm oder ein Dokument der europäischen Normung zu erarbeiten. Europäische Normen und Dokumente der europäischen Normung müssen marktorientiert sein, dem öffentlichen Interesse und den in dem Auftrag der Kommission klar dargelegten politischen Zielen Rechnung tragen und auf Konsens gegründet sein. Die Kommission legt die Anforderungen an den Inhalt des in Auftrag gegebenen Dokuments und einen Termin für dessen Annahme fest. (2) Die Entscheidungen nach Absatz 1 sind gemäß dem in Artikel 22 Ab…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Das Hauptziel von Normung ist die Festlegung freiwilliger technischer oder die Qualität betreffender Spezifikationen, denen bereits bestehende oder künftige Produkte, Produktionsverfahren oder Dienstleistungen entsprechen können. Normung erstreckt sich über unterschiedliche Bereiche, beispielsweise die Normung unterschiedlicher Ausführungen oder Größen eines Produkts oder technische Spezifikationen in Produkt- oder Dienstleistungsmärkten, bei denen die Kompatibilität und Interoperabilität mit anderen Produkten oder Systemen unerlässlich sind.
>
> *(2)* Die europäische Normung wird durch und für die einschlägigen Interessenträger organisiert, und zwar auf der Grundlage nationaler Vertretung (Europäisches Komitee für Normung (CEN) und das Europäisches Komitee für Elektrotechnische Normung (Cenelec)) und direkter Beteiligung (Europäisches Institut für Telekommunikationsnormen (ETSI)), und sie stützt sich auf die von der Welthandelsorganisation (WTO) anerkannten Grundsätze auf dem Gebiet der Normung, nämlich Kohärenz, Transparenz, Offenheit, Konsens, Freiwilligkeit der Anwendung, Unabhängigkeit von Einzelinteressen und Effizienz (im Folgenden „Grundprinzipien“). Nach den Grundprinzipien ist es wichtig, dass alle interessierten Kreise, einschließlich der Behörden und der kleineren und mittleren Unternehmen (KMU), angemessen in den nationalen und europäischen Normungsprozess einbezogen werden. Die nationalen Normungsorganisationen sollten außerdem die Mitwirkung von Interessenträgern fördern und erleichtern.
>
> *(3)* Die europäische Normung trägt ferner dazu bei, die Wettbewerbsfähigkeit der Unternehmen zu verbessern, indem sie insbesondere den freien Verkehr von Waren und Dienstleistungen, die Interoperabilität von Netzwerken, Kommunikationsmittel sowie die technologische Entwicklung und die Innovation vereinfacht. Durch die europäische Normung wird die weltweite Wettbewerbsfähigkeit der europäischen Industrie besonders dann gestärkt, wenn sie in Koordination mit den internationalen Normungsorganisationen, d. h. der Internationalen Organisation für Normung (ISO), der Internationalen Elektrotechnischen Kommission (IEC) und der Internationalen Fernmeldeunion (ITU), erfolgt. Normen haben eindeutig positive Auswirkungen auf die Wirtschaft, indem sie unter anderem die wirtschaftliche Durchdringung im Binnenmarkt fördern und zur Entwicklung neuer und verbesserter Produkte und Märkte sowie besserer Lieferbedingungen beitragen. Normen führen daher in der Regel zu einem stärkeren Wettbewerb und niedrigeren Output- und Verkaufskosten, was den Volkswirtschaften insgesamt und besonders den Verbrauchern zugute kommt. Normen leisten einen Beitrag zur Aufrechterhaltung und Verbesserung von Qualität, sind ein…
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`standardisation-de:art-10`</sub>

---

### 15 · ai-act-de · Art. 58

**Detaillierte Regelungen für KI-Reallabore und deren Funktionsweise**

> (1) Um eine Zersplitterung in der Union zu vermeiden, erlässt die Kommission Durchführungsrechtsakte, in denen detaillierte Regelungen für die Einrichtung, Entwicklung, Umsetzung, den Betrieb und die Beaufsichtigung der KI-Reallabore enthalten sind. In den Durchführungsrechtsakten sind gemeinsame Grundsätze zu den folgenden Aspekten festgelegt: a) Voraussetzungen und Auswahlkriterien für eine Beteiligung am KI-Reallabor; b) Verfahren für Antragstellung, Beteiligung, Überwachung, Ausstieg und Beendigung bezüglich des KI-Reallabors, einschließlich Plan und Abschlussbericht für das Reallabor; c) für Beteiligte geltende Anforderungen und Bedingungen. Diese Durchführungsrechtsakte werden gemäß de…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur…
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`ai-act-de:art-58`</sub>

---

### 16 · cra-de · Art. 15

**Freiwillige Meldungen**

> (1) Hersteller sowie andere natürliche oder juristische Personen können jede in einem Produkt mit digitalen Elementen enthaltene Schwachstelle sowie Cyberbedrohungen, die sich auf das Risikoprofil eines Produkts mit digitalen Elementen auswirken könnten, freiwillig einem als Koordinator benannten CSIRT oder der ENISA melden. (2) Hersteller sowie andere natürliche oder juristische Personen können jeden Sicherheitsvorfall, der sich auf die Sicherheit des Produkts mit digitalen Elementen auswirkt, sowie Beinahe-Vorfälle, die zu einem solchen Sicherheitsvorfall hätten führen können, auf freiwilliger Basis einem als Koordinator benannten CSIRT oder der ENISA melden. (3) Das als Koordinator benann…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da…
>
> *(2)* Mit dieser Verordnung sollen die Rahmenbedingungen für die Entwicklung sicherer Produkte mit digitalen Elementen geschaffen werden, damit Hardware- und Softwareprodukte mit weniger Schwachstellen in den Verkehr gebracht werden und damit sich die Hersteller während des gesamten Lebenszyklus eines Produkts konsequent um die Sicherheit kümmern. Außerdem sollen Bedingungen geschaffen werden, die es den Nutzern ermöglichen, bei der Auswahl und Verwendung von Produkten mit digitalen Elementen die Cybersicherheit zu berücksichtigen, beispielsweise durch mehr Transparenz in Bezug auf den Unterstützungszeitraum für auf dem Markt bereitgestellte Produkte mit digitalen Elementen.
>
> *(3)* Das geltende einschlägige Unionsrecht umfasst mehrere horizontale Vorschriften, die bestimmte Aspekte der Cybersicherheit aus unterschiedlichen Blickwinkeln regeln, darunter auch Maßnahmen zur Erhöhung der Sicherheit der digitalen Lieferkette. Das bestehende Unionsrecht in Bezug auf die Cybersicherheit, wozu die Verordnung (EU) 2019/881 des Europäischen Parlaments und des Rates (3) und die Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates (4) gehören, enthält jedoch keine unmittelbar verbindlichen Anforderungen an die Sicherheit von Produkten mit digitalen Elementen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`cra-de:art-15`</sub>

---

### 17 · data-act-de · Art. 24

**Tragweite der technischen Verpflichtungen**

> Die Verantwortung von Anbietern von Datenverarbeitungsdiensten gemäß der Artikel 23, 25, 29, 30 und 34 gilt nur für die Dienste, Verträge oder Geschäftsgepflogenheiten, die vom ursprünglichen Anbieter der Datenverarbeitungsdienste angeboten wurden.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In den letzten Jahren haben datengetriebene Technologien transformative Wirkung auf alle Wirtschaftssektoren gehabt. Insbesondere die rasche Verbreitung von Produkten, die mit dem Internet vernetzt sind, hat den Umfang und den potenziellen Wert von Daten für Verbraucher, Unternehmen und Gesellschaft erhöht. Hochwertige und interoperable Daten aus verschiedenen Bereichen steigern die Wettbewerbsfähigkeit und Innovation und sorgen für ein nachhaltiges Wirtschaftswachstum. Dieselben Daten können unbegrenzt für verschiedene Zwecke verwendet und weiterverwendet werden, ohne dass dadurch Qualität oder Quantität beeinträchtigt wird.
>
> *(2)* Hindernisse bei der Datenweitergabe verhindern jedoch eine optimale Verteilung der Daten zum Nutzen der Gesellschaft. Zu diesen Hindernissen gehören der Mangel an Anreizen für Dateninhaber, freiwillig Vereinbarungen über die Datenweitergabe einzugehen, Unsicherheiten in Bezug auf Rechte und Pflichten in Verbindung mit Daten, die Kosten der Auftragsvergabe in Bezug auf technische Schnittstellen und für deren Einrichtung, die starke Fragmentierung von Informationen in Datensilos, die schlechte Verwaltung von Metadaten, fehlende Normen für die semantische und technische Interoperabilität, Engpässe beim Datenzugang, das Fehlen einheitlicher Verfahren für die Datenweitergabe und der Missbrauch vertraglicher Ungleichgewichte hinsichtlich Datenzugang und Datennutzung.
>
> *(3)* In Sektoren mit zahlreichen Kleinstunternehmen sowie Kleinunternehmen und mittleren Unternehmen im Sinne von Artikel 2 des Anhangs der Empfehlung 2003/361/EG der Kommission (5) (KMU) mangelt es häufig an digitalen Kapazitäten und Kompetenzen für die Erhebung, Analyse und Nutzung von Daten; zudem ist der Zugang oftmals eingeschränkt, weil ein einziger Akteur im System die Daten hält oder weil Daten oder Datendienste an sich bzw. über Grenzen hinweg nicht interoperabel sind.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`data-act-de:art-24`</sub>

---

### 18 · dora · Art. 23

**Operational or security payment-related incidents concerning credit institutions, payment institutions, account information service providers, and electronic money institutions**

> The requirements laid down in this Chapter shall also apply to operational or security payment-related incidents and to major operational or security payment-related incidents, where they concern credit institutions, payment institutions, account information service providers, and electronic money institutions. CHAPTER IV Digital operational resilience testing

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In the digital age, information and communication technology (ICT) supports complex systems used for everyday activities. It keeps our economies running in key sectors, including the financial sector, and enhances the functioning of the internal market. Increased digitalisation and interconnectedness also amplify ICT risk, making society as a whole, and the financial system in particular, more vulnerable to cyber threats or ICT disruptions. While the ubiquitous use of ICT systems and high digitalisation and connectivity are today core features of the activities of Union financial entities, their digital resilience has yet to be better addressed and integrated into their broader operational frameworks.
>
> *(2)* The use of ICT has in the past decades gained a pivotal role in the provision of financial services, to the point where it has now acquired a critical importance in the operation of typical daily functions of all financial entities. Digitalisation now covers, for instance, payments, which have increasingly moved from cash and paper-based methods to the use of digital solutions, as well as securities clearing and settlement, electronic and algorithmic trading, lending and funding operations, peer-to-peer finance, credit rating, claim management and back-office operations. The insurance sector has also been transformed by the use of ICT, from the emergence of insurance intermediaries offering their services online operating with InsurTech, to digital insurance underwriting. Finance has not only become largely digital throughout the whole sector, but digitalisation has also deepened interconnections and dependencies within the financial sector and with third-party infrastructure and service providers.
>
> *(3)* The European Systemic Risk Board (ESRB) reaffirmed in a 2020 report addressing systemic cyber risk how the existing high level of interconnectedness across financial entities, financial markets and financial market infrastructures, and particularly the interdependencies of their ICT systems, could constitute a systemic vulnerability because localised cyber incidents could quickly spread from any of the approximately 22 000 Union financial entities to the entire financial system, unhindered by geographical boundaries. Serious ICT breaches that occur in the financial sector do not merely affect financial entities taken in isolation. They also smooth the way for the propagation of localised vulnerabilities across the financial transmission channels and potentially trigger adverse consequences for the stability of the Union’s financial system, such as generating liquidity runs and an overall loss of confidence and trust in financial markets.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dora:art-23`</sub>

---

### 19 · dsgvo-en · Art. 68

**European Data Protection Board**

> 1. The European Data Protection Board (the ‘Board’) is hereby established as a body of the Union and shall have legal personality. 2. The Board shall be represented by its Chair. 3. The Board shall be composed of the head of one supervisory authority of each Member State and of the European Data Protection Supervisor, or their respective representatives. 4. Where in a Member State more than one supervisory authority is responsible for monitoring the application of the provisions pursuant to this Regulation, a joint representative shall be appointed in accordance with that Member State's law. 5. The Commission shall have the right to participate in the activities and meetings of the Board wit…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* The protection of natural persons in relation to the processing of personal data is a fundamental right. Article 8(1) of the Charter of Fundamental Rights of the European Union (the ‘Charter’) and Article 16(1) of the Treaty on the Functioning of the European Union (TFEU) provide that everyone has the right to the protection of personal data concerning him or her.
>
> *(2)* The principles of, and rules on the protection of natural persons with regard to the processing of their personal data should, whatever their nationality or residence, respect their fundamental rights and freedoms, in particular their right to the protection of personal data. This Regulation is intended to contribute to the accomplishment of an area of freedom, security and justice and of an economic union, to economic and social progress, to the strengthening and the convergence of the economies within the internal market, and to the well-being of natural persons.
>
> *(3)* Directive 95/46/EC of the European Parliament and of the Council (4) seeks to harmonise the protection of fundamental rights and freedoms of natural persons in respect of processing activities and to ensure the free flow of personal data between Member States.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dsgvo-en:art-68`</sub>

---

### 20 · eidas-en · Art. 25

**Legal effects of electronic signatures**

> 1. An electronic signature shall not be denied legal effect and admissibility as evidence in legal proceedings solely on the grounds that it is in an electronic form or that it does not meet the requirements for qualified electronic signatures. 2. A qualified electronic signature shall have the equivalent legal effect of a handwritten signature. 3. A qualified electronic signature based on a qualified certificate issued in one Member State shall be recognised as a qualified electronic signature in all other Member States.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Building trust in the online environment is key to economic and social development. Lack of trust, in particular because of a perceived lack of legal certainty, makes consumers, businesses and public authorities hesitate to carry out transactions electronically and to adopt new services.
>
> *(2)* This Regulation seeks to enhance trust in electronic transactions in the internal market by providing a common foundation for secure electronic interaction between citizens, businesses and public authorities, thereby increasing the effectiveness of public and private online services, electronic business and electronic commerce in the Union.
>
> *(3)* Directive 1999/93/EC of the European Parliament and of the Council (3), dealt with electronic signatures without delivering a comprehensive cross-border and cross-sector framework for secure, trustworthy and easy-to-use electronic transactions. This Regulation enhances and expands the acquis of that Directive.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`eidas-en:art-25`</sub>

---

### 21 · emoney-de · Art. 14

**Durchführungsmaßnahmen**

> (1) Die Kommission kann Maßnahmen erlassen, die zur Aktualisierung der Bestimmungen dieser Richtlinie erforderlich sind, um der Inflation oder technologischen Entwicklungen und Entwicklungen am Markt Rechnung zu tragen. Diese Maßnahmen zur Änderung nicht wesentlicher Bestimmungen dieser Richtlinie werden nach dem in Artikel 15 Absatz 2 genannten Regelungsverfahren mit Kontrolle erlassen. (2) Die Kommission trifft Maßnahmen zur Gewährleistung einer einheitlichen Anwendung der in Artikel 1 Absätze 4 und 5 erwähnten Ausnahmen. Diese Maßnahmen zur Änderung nicht wesentlicher Bestimmungen dieser Richtlinie werden nach dem in Artikel 15 Absatz 2 genannten Regelungsverfahren mit Kontrolle erlassen.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Richtlinie 2000/46/EG des Europäischen Parlaments und des Rates vom 18. September 2000 über die Aufnahme, Ausübung und Beaufsichtigung der Tätigkeit von E-Geld-Instituten (4) wurde in Reaktion auf die Entstehung neuer Arten von vorausbezahlten elektronischen Zahlungsmitteln erlassen und sollte einen klaren Rechtsrahmen abstecken, um den Binnenmarkt zu stärken und gleichzeitig eine angemessene Finanzaufsicht zu gewährleisten.
>
> *(2)* Die Kommission hob in ihrer Überprüfung der Richtlinie 2000/46/EG hervor, dass die Richtlinie geändert werden muss, da einige ihrer Bestimmungen die Entstehung eines echten Binnenmarkts für E-Geld-Dienstleistungen und die Entwicklung dieser benutzerfreundlichen Dienstleistungen offenbar verhindert haben.
>
> *(3)* Mit der Richtlinie 2007/64/EG des Europäischen Parlaments und des Rates vom 13. November 2007 über Zahlungsdienste im Binnenmarkt (5) wurde ein moderner und kohärenter Rechtsrahmen für Zahlungsdienste eingeführt, der auch die Abstimmung der nationalen Vorschriften für die aufsichtsrechtlichen Anforderungen an eine neue Kategorie von Zahlungsdienstleistern, die Zahlungsinstitute, vorsieht.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`emoney-de:art-14`</sub>

---

### 22 · lksg · § 24

**Bußgeldvorschriften**

> (1) Ordnungswidrig handelt, wer vorsätzlich oder fahrlässig 1.entgegen § 4 Absatz 3 Satz 1 nicht dafür sorgt, dass eine dort genannte Festlegung getroffen ist,2.entgegen § 5 Absatz 1 Satz 1 oder § 9 Absatz 3 Nummer 1 eine Risikoanalyse nicht, nicht richtig, nicht vollständig oder nicht rechtzeitig durchführt,3.entgegen § 6 Absatz 1 eine Präventionsmaßnahme nicht oder nicht rechtzeitig ergreift,4.entgegen § 6 Absatz 5 Satz 1, § 7 Absatz 4 Satz 1 oder § 8 Absatz 5 Satz 1 eine Überprüfung nicht oder nicht rechtzeitig vornimmt,5.entgegen § 6 Absatz 5 Satz 3, § 7 Absatz 4 Satz 3 oder § 8 Absatz 5 Satz 2 eine Maßnahme nicht oder nicht rechtzeitig aktualisiert,6.entgegen § 7 Absatz 1 Satz 1 eine Ab…

*Erwägungsgründe dieser Sprachfassung liegen noch nicht im Korpus vor.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`lksg:24`</sub>

---

### 23 · mdr-de · Art. 121

**Bewertung**

> Spätestens am 27. Mai 2027 bewertet die Kommission die Anwendung dieser Verordnung und erstellt einen Bewertungsbericht über die im Hinblick auf die darin enthaltenen Ziele erreichten Fortschritte; dabei werden auch die für die Durchführung dieser Verordnung erforderlichen Ressourcen bewertet. Besonders zu beachten ist die Rückverfolgbarkeit von Medizinprodukten anhand der in Artikel 27 vorgesehenen Erfassung der UDI durch Wirtschaftsakteure, Gesundheitseinrichtungen und Angehörige der Gesundheitsberufe.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Der EU-Rechtsrahmen für Medizinprodukte — mit Ausnahme von In-vitro-Diagnostika — besteht aus der Richtlinie 90/385/EWG des Rates (3) und der Richtlinie 93/42/EWG des Rates (4). Um einen soliden, transparenten, berechenbaren und nachhaltigen Rechtsrahmen für Medizinprodukte zu schaffen, der ein hohes Niveau an Sicherheit und Gesundheitsschutz gewährleistet, gleichzeitig aber innovationsfördernd wirkt, ist jedoch eine grundlegende Überarbeitung dieser Richtlinien erforderlich.
>
> *(2)* Ausgehend von einem hohen Gesundheitsschutzniveau für Patienten und Anwender soll mit der vorliegenden Verordnung ein reibungslos funktionierender Binnenmarkt für Medizinprodukte unter Berücksichtigung der in diesem Sektor tätigen kleinen und mittleren Unternehmen sichergestellt werden. Außerdem sind in dieser Verordnung hohe Standards für die Qualität und Sicherheit von Medizinprodukten festgelegt, durch die allgemeine Sicherheitsbedenken hinsichtlich dieser Produkte ausgeräumt werden sollen. Die beiden Ziele werden parallel verfolgt; sie sind untrennbar miteinander verbunden und absolut gleichrangig. Gestützt auf Artikel 114 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) wird mit dieser Verordnung eine Harmonisierung der Rechtsvorschriften für das Inverkehrbringen und die Inbetriebnahme von Medizinprodukten und ihrem Zubehör auf dem Unionsmarkt vorgenommen, denen dadurch der Grundsatz des freien Warenverkehrs zugute kommen kann. Im Sinne von Artikel 168 Absatz 4 Buchstabe c AEUV werden mit dieser Verordnung hohe Standards für Qualität und Sicherheit der Medizinprodukte festgelegt, indem unter anderem dafür gesorgt wird, dass die im Rahmen klinischer Prüfungen ge…
>
> *(3)* Mit dieser Verordnung sollen nicht die Vorschriften harmonisiert werden, die die weitere Bereitstellung auf dem Markt von bereits in Betrieb genommenen Medizinprodukten, etwa im Zusammenhang mit dem Verkauf gebrauchter Produkte, betreffen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`mdr-de:art-121`</sub>

---

### 24 · psd2-de · Art. 98

**Technische Regulierungsstandards für die Authentifizierung und die Kommunikation**

> (1) Die EBA arbeitet im Einklang mit Artikel 10 der Verordnung (EU) Nr. 1093/2010 in enger Zusammenarbeit mit der EZB und nach Anhörung aller maßgeblichen Akteure, einschließlich des Zahlungsverkehrsmarktes, unter Berücksichtigung der Interessen aller Beteiligten für Zahlungsdienstleister im Sinne des Artikels 1 Absatz 1 dieser Richtlinie technische Regulierungsstandards aus, in denen Folgendes präzisiert wird: a) die Erfordernisse des Verfahrens zur starken Kundenauthentifizierung gemäß Artikel 97 Absätze 1 und 2, b) die Ausnahmen von der Anwendung des Artikels 97 Absätze 1, 2 und 3 unter Zugrundelegung der Kriterien des Absatzes 3 dieses Artikels, c) die Anforderungen, die Sicherheitsmaßna…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In den letzten Jahren sind bei der Integration von Massenzahlungen in der Union erhebliche Fortschritte erzielt worden, insbesondere im Zusammenhang mit den Rechtsakten der Union zum Zahlungsverkehr, und hier vor allem durch die Richtlinie 2007/64/EG des Europäischen Parlaments und des Rates (4), die Verordnung (EG) Nr. 924/2009 des Europäischen Parlaments und des Rates (5), die Richtlinie 2009/110/EG des Europäischen Parlaments und des Rates (6) sowie die Verordnung (EU) Nr. 260/2012 des Europäischen Parlaments und des Rates (7). Mit der Richtlinie 2011/83/EU des Europäischen Parlaments und des Rates (8) wurde der Rechtsrahmen für Zahlungsdienste weiter ergänzt, indem durch die Festlegung einer bestimmten Obergrenze die Fähigkeit der Einzelhändler, ihren Kunden für die Nutzung eines bestimmten Zahlungsmittels einen Aufschlag zu berechnen, eingeschränkt wurde.
>
> *(2)* Der überarbeitete Rechtsrahmen der Union für Zahlungsdienste wird durch die Verordnung (EU) 2015/751 des Europäischen Parlaments und des Rates (9) ergänzt. Mit jener Verordnung werden insbesondere Vorschriften über das Erheben von Interbankenentgelten für kartengebundene Zahlungsvorgänge eingeführt und es wird bezweckt, die Vollendung eines tatsächlich integrierten Marktes für kartengebundene Zahlungen weiter zu beschleunigen.
>
> *(3)* Die Richtlinie 2007/64/EG wurde im Dezember 2007 auf der Grundlage eines Kommissionsvorschlags vom Dezember 2005 angenommen. Seitdem hat der Markt für Massenzahlungsverkehr bedeutende technische Innovationen erfahren, die mit einem raschen zahlenmäßigen Wachstum der elektronischen und mobilen Zahlungen und mit dem Aufkommen neuer Arten von Zahlungsdiensten am Markt einhergingen, die eine Herausforderung für den derzeit geltenden Rahmen darstellen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`psd2-de:art-98`</sub>

---

### 25 · standardisation-de · Art. 13

**Identifizierung referenzierbarer technischer IKT-Spezifikationen**

> (1) Die Kommission kann entweder auf den Vorschlag eines Mitgliedstaats hin oder auf eigene Initiative entscheiden, technische IKT-Spezifikationen zu identifizieren, bei denen es sich nicht um nationale, europäische oder internationale Normen handelt, die jedoch die in Anhang II genannten Anforderungen erfüllen und auf die hauptsächlich zur Herbeiführung der Interoperabilität bei der Vergabe öffentlicher Aufträge Bezug genommen werden kann. (2) Wenn eine gemäß Absatz 1 identifizierten technische IKT-Spezifikation geändert oder zurückgezogen wird oder den Anforderungen des Anhangs II nicht mehr genügt, kann die Kommission entweder auf den Vorschlag eines Mitgliedstaats hin oder auf eigene Ini…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Das Hauptziel von Normung ist die Festlegung freiwilliger technischer oder die Qualität betreffender Spezifikationen, denen bereits bestehende oder künftige Produkte, Produktionsverfahren oder Dienstleistungen entsprechen können. Normung erstreckt sich über unterschiedliche Bereiche, beispielsweise die Normung unterschiedlicher Ausführungen oder Größen eines Produkts oder technische Spezifikationen in Produkt- oder Dienstleistungsmärkten, bei denen die Kompatibilität und Interoperabilität mit anderen Produkten oder Systemen unerlässlich sind.
>
> *(2)* Die europäische Normung wird durch und für die einschlägigen Interessenträger organisiert, und zwar auf der Grundlage nationaler Vertretung (Europäisches Komitee für Normung (CEN) und das Europäisches Komitee für Elektrotechnische Normung (Cenelec)) und direkter Beteiligung (Europäisches Institut für Telekommunikationsnormen (ETSI)), und sie stützt sich auf die von der Welthandelsorganisation (WTO) anerkannten Grundsätze auf dem Gebiet der Normung, nämlich Kohärenz, Transparenz, Offenheit, Konsens, Freiwilligkeit der Anwendung, Unabhängigkeit von Einzelinteressen und Effizienz (im Folgenden „Grundprinzipien“). Nach den Grundprinzipien ist es wichtig, dass alle interessierten Kreise, einschließlich der Behörden und der kleineren und mittleren Unternehmen (KMU), angemessen in den nationalen und europäischen Normungsprozess einbezogen werden. Die nationalen Normungsorganisationen sollten außerdem die Mitwirkung von Interessenträgern fördern und erleichtern.
>
> *(3)* Die europäische Normung trägt ferner dazu bei, die Wettbewerbsfähigkeit der Unternehmen zu verbessern, indem sie insbesondere den freien Verkehr von Waren und Dienstleistungen, die Interoperabilität von Netzwerken, Kommunikationsmittel sowie die technologische Entwicklung und die Innovation vereinfacht. Durch die europäische Normung wird die weltweite Wettbewerbsfähigkeit der europäischen Industrie besonders dann gestärkt, wenn sie in Koordination mit den internationalen Normungsorganisationen, d. h. der Internationalen Organisation für Normung (ISO), der Internationalen Elektrotechnischen Kommission (IEC) und der Internationalen Fernmeldeunion (ITU), erfolgt. Normen haben eindeutig positive Auswirkungen auf die Wirtschaft, indem sie unter anderem die wirtschaftliche Durchdringung im Binnenmarkt fördern und zur Entwicklung neuer und verbesserter Produkte und Märkte sowie besserer Lieferbedingungen beitragen. Normen führen daher in der Regel zu einem stärkeren Wettbewerb und niedrigeren Output- und Verkaufskosten, was den Volkswirtschaften insgesamt und besonders den Verbrauchern zugute kommt. Normen leisten einen Beitrag zur Aufrechterhaltung und Verbesserung von Qualität, sind ein…
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`standardisation-de:art-13`</sub>

---

### 26 · ai-act-de · Art. 66

**Aufgaben des KI-Gremiums**

> Das KI-Gremium berät und unterstützt die Kommission und die Mitgliedstaaten, um die einheitliche und wirksame Anwendung dieser Verordnung zu erleichtern. Für diese Zwecke kann das KI-Gremium insbesondere a) zur Koordinierung zwischen den für die Anwendung dieser Verordnung zuständigen nationalen Behörden beitragen und in Zusammenarbeit mit den betreffenden Marktüberwachungsbehörden und vorbehaltlich ihrer Zustimmung gemeinsame Tätigkeiten der Marktüberwachungsbehörden gemäß Artikel 74 Absatz 11 unterstützen; b) technisches und regulatorisches Fachwissen und bewährte Verfahren zusammentragen und unter den Mitgliedstaaten verbreiten; c) zur Durchführung dieser Verordnung Beratung anbieten, ins…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur…
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`ai-act-de:art-66`</sub>

---

### 27 · cra-de · Art. 7

**Wichtige Produkte mit digitalen Elementen**

> (1) Produkte mit digitalen Elementen, die die Kernfunktionen einer in Anhang III aufgeführten Produktkategorie aufweisen, gelten als wichtige Produkte mit digitalen Elementen und unterliegen den in Artikel 32 Absätze 2 und 3 genannten Konformitätsbewertungsverfahren. Die Integration eines Produkts mit digitalen Elementen, das die Kernfunktionen einer in Anhang III aufgeführten Produktkategorie aufweist, führt für sich genommen nicht dazu, dass das Produkt, in das es integriert ist, den Konformitätsbewertungsverfahren gemäß Artikel 32 Absätze 2 und 3 unterliegt. (2) Die in Absatz 1 dieses Artikels genannten Kategorien von Produkten mit digitalen Elementen, die gemäß Anhang III in die Klassen …

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da…
>
> *(2)* Mit dieser Verordnung sollen die Rahmenbedingungen für die Entwicklung sicherer Produkte mit digitalen Elementen geschaffen werden, damit Hardware- und Softwareprodukte mit weniger Schwachstellen in den Verkehr gebracht werden und damit sich die Hersteller während des gesamten Lebenszyklus eines Produkts konsequent um die Sicherheit kümmern. Außerdem sollen Bedingungen geschaffen werden, die es den Nutzern ermöglichen, bei der Auswahl und Verwendung von Produkten mit digitalen Elementen die Cybersicherheit zu berücksichtigen, beispielsweise durch mehr Transparenz in Bezug auf den Unterstützungszeitraum für auf dem Markt bereitgestellte Produkte mit digitalen Elementen.
>
> *(3)* Das geltende einschlägige Unionsrecht umfasst mehrere horizontale Vorschriften, die bestimmte Aspekte der Cybersicherheit aus unterschiedlichen Blickwinkeln regeln, darunter auch Maßnahmen zur Erhöhung der Sicherheit der digitalen Lieferkette. Das bestehende Unionsrecht in Bezug auf die Cybersicherheit, wozu die Verordnung (EU) 2019/881 des Europäischen Parlaments und des Rates (3) und die Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates (4) gehören, enthält jedoch keine unmittelbar verbindlichen Anforderungen an die Sicherheit von Produkten mit digitalen Elementen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`cra-de:art-7`</sub>

---

### 28 · data-act-de · Art. 32

**Staatlicher Zugang und staatliche Übermittlung im internationalen Umfeld**

> (1) Unbeschadet der Absätze 2 oder 3 treffen Anbieter von Datenverarbeitungsdiensten alle angemessenen technischen, organisatorischen und rechtlichen Maßnahmen, einschließlich Verträgen, um den staatlichen Zugang zu und die staatliche Übermittlung von in der Union gespeicherten nicht-personenbezogenen Daten im internationalen Umfeld und durch Drittländer zu verhindern, wenn dies im Widerspruch zum Unionsrecht oder zum nationalen Recht des betreffenden Mitgliedstaats stehen würde. (2) Für jegliche Entscheidung bzw. jegliches Urteil eines Gerichts eines Drittlands und jegliche Entscheidung einer Verwaltungsbehörde eines Drittlands, die Anbieter von Datenverarbeitungsdiensten auffordern, in den…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In den letzten Jahren haben datengetriebene Technologien transformative Wirkung auf alle Wirtschaftssektoren gehabt. Insbesondere die rasche Verbreitung von Produkten, die mit dem Internet vernetzt sind, hat den Umfang und den potenziellen Wert von Daten für Verbraucher, Unternehmen und Gesellschaft erhöht. Hochwertige und interoperable Daten aus verschiedenen Bereichen steigern die Wettbewerbsfähigkeit und Innovation und sorgen für ein nachhaltiges Wirtschaftswachstum. Dieselben Daten können unbegrenzt für verschiedene Zwecke verwendet und weiterverwendet werden, ohne dass dadurch Qualität oder Quantität beeinträchtigt wird.
>
> *(2)* Hindernisse bei der Datenweitergabe verhindern jedoch eine optimale Verteilung der Daten zum Nutzen der Gesellschaft. Zu diesen Hindernissen gehören der Mangel an Anreizen für Dateninhaber, freiwillig Vereinbarungen über die Datenweitergabe einzugehen, Unsicherheiten in Bezug auf Rechte und Pflichten in Verbindung mit Daten, die Kosten der Auftragsvergabe in Bezug auf technische Schnittstellen und für deren Einrichtung, die starke Fragmentierung von Informationen in Datensilos, die schlechte Verwaltung von Metadaten, fehlende Normen für die semantische und technische Interoperabilität, Engpässe beim Datenzugang, das Fehlen einheitlicher Verfahren für die Datenweitergabe und der Missbrauch vertraglicher Ungleichgewichte hinsichtlich Datenzugang und Datennutzung.
>
> *(3)* In Sektoren mit zahlreichen Kleinstunternehmen sowie Kleinunternehmen und mittleren Unternehmen im Sinne von Artikel 2 des Anhangs der Empfehlung 2003/361/EG der Kommission (5) (KMU) mangelt es häufig an digitalen Kapazitäten und Kompetenzen für die Erhebung, Analyse und Nutzung von Daten; zudem ist der Zugang oftmals eingeschränkt, weil ein einziger Akteur im System die Daten hält oder weil Daten oder Datendienste an sich bzw. über Grenzen hinweg nicht interoperabel sind.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`data-act-de:art-32`</sub>

---

### 29 · dora · Art. 32

**Structure of the Oversight Framework**

> 1. The Joint Committee, in accordance with Article 57(1) of Regulations (EU) No 1093/2010, (EU) No 1094/2010 and (EU) No 1095/2010, shall establish the Oversight Forum as a sub-committee for the purposes of supporting the work of the Joint Committee and of the Lead Overseer referred to in Article 31(1), point (b), in the area of ICT third-party risk across financial sectors. The Oversight Forum shall prepare the draft joint positions and the draft common acts of the Joint Committee in that area. The Oversight Forum shall regularly discuss relevant developments on ICT risk and vulnerabilities and promote a consistent approach in the monitoring of ICT third-party risk at Union level. 2. The Ov…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In the digital age, information and communication technology (ICT) supports complex systems used for everyday activities. It keeps our economies running in key sectors, including the financial sector, and enhances the functioning of the internal market. Increased digitalisation and interconnectedness also amplify ICT risk, making society as a whole, and the financial system in particular, more vulnerable to cyber threats or ICT disruptions. While the ubiquitous use of ICT systems and high digitalisation and connectivity are today core features of the activities of Union financial entities, their digital resilience has yet to be better addressed and integrated into their broader operational frameworks.
>
> *(2)* The use of ICT has in the past decades gained a pivotal role in the provision of financial services, to the point where it has now acquired a critical importance in the operation of typical daily functions of all financial entities. Digitalisation now covers, for instance, payments, which have increasingly moved from cash and paper-based methods to the use of digital solutions, as well as securities clearing and settlement, electronic and algorithmic trading, lending and funding operations, peer-to-peer finance, credit rating, claim management and back-office operations. The insurance sector has also been transformed by the use of ICT, from the emergence of insurance intermediaries offering their services online operating with InsurTech, to digital insurance underwriting. Finance has not only become largely digital throughout the whole sector, but digitalisation has also deepened interconnections and dependencies within the financial sector and with third-party infrastructure and service providers.
>
> *(3)* The European Systemic Risk Board (ESRB) reaffirmed in a 2020 report addressing systemic cyber risk how the existing high level of interconnectedness across financial entities, financial markets and financial market infrastructures, and particularly the interdependencies of their ICT systems, could constitute a systemic vulnerability because localised cyber incidents could quickly spread from any of the approximately 22 000 Union financial entities to the entire financial system, unhindered by geographical boundaries. Serious ICT breaches that occur in the financial sector do not merely affect financial entities taken in isolation. They also smooth the way for the propagation of localised vulnerabilities across the financial transmission channels and potentially trigger adverse consequences for the stability of the Union’s financial system, such as generating liquidity runs and an overall loss of confidence and trust in financial markets.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dora:art-32`</sub>

---

### 30 · dsgvo · Art. 40

**Verhaltensregeln**

> (1) Die Mitgliedstaaten, die Aufsichtsbehörden, der Ausschuss und die Kommission fördern die Ausarbeitung von Verhaltensregeln, die nach Maßgabe der Besonderheiten der einzelnen Verarbeitungsbereiche und der besonderen Bedürfnisse von Kleinstunternehmen sowie kleinen und mittleren Unternehmen zur ordnungsgemäßen Anwendung dieser Verordnung beitragen sollen. (2) Verbände und andere Vereinigungen, die Kategorien von Verantwortlichen oder Auftragsverarbeitern vertreten, können Verhaltensregeln ausarbeiten oder ändern oder erweitern, mit denen die Anwendung dieser Verordnung beispielsweise zu dem Folgenden präzisiert wird: a) faire und transparente Verarbeitung; b) die berechtigten Interessen de…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Der Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten ist ein Grundrecht. Gemäß Artikel 8 Absatz 1 der Charta der Grundrechte der Europäischen Union (im Folgenden „Charta“) sowie Artikel 16 Absatz 1 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) hat jede Person das Recht auf Schutz der sie betreffenden personenbezogenen Daten.
>
> *(2)* Die Grundsätze und Vorschriften zum Schutz natürlicher Personen bei der Verarbeitung ihrer personenbezogenen Daten sollten gewährleisten, dass ihre Grundrechte und Grundfreiheiten und insbesondere ihr Recht auf Schutz personenbezogener Daten ungeachtet ihrer Staatsangehörigkeit oder ihres Aufenthaltsorts gewahrt bleiben. Diese Verordnung soll zur Vollendung eines Raums der Freiheit, der Sicherheit und des Rechts und einer Wirtschaftsunion, zum wirtschaftlichen und sozialen Fortschritt, zur Stärkung und zum Zusammenwachsen der Volkswirtschaften innerhalb des Binnenmarkts sowie zum Wohlergehen natürlicher Personen beitragen.
>
> *(3)* Zweck der Richtlinie 95/46/EG des Europäischen Parlaments und des Rates (4) ist die Harmonisierung der Vorschriften zum Schutz der Grundrechte und Grundfreiheiten natürlicher Personen bei der Datenverarbeitung sowie die Gewährleistung des freien Verkehrs personenbezogener Daten zwischen den Mitgliedstaaten.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dsgvo:art-40`</sub>

---

## Gegenproben

### 31 · ai-act-de · Art. 108   *(Gegenprobe)*

**Änderungen der Verordnung (EU) 2018/1139**

> Die Verordnung (EU) 2018/1139 wird wie folgt geändert: 1. In Artikel 17 wird folgender Absatz angefügt:<br>„(3) Unbeschadet des Absatzes 2 werden beim Erlass von Durchführungsrechtsakten nach Absatz 1, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 des Europäischen Parlaments und des Rates [(\*)](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32024R1689#ntr*-L_202401689DE.000101-E0064) handelt, die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.<br>[(\*)](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32024R1689#ntc*-L_202401689DE.…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur…
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`ai-act-de:art-108`</sub>

---

### 32 · cra-de · Art. 69   *(Gegenprobe)*

**Übergangsbestimmungen**

> (1) EU-Baumusterprüfbescheinigungen und Zulassungen, die in Bezug auf Cybersicherheitsanforderungen für Produkte mit digitalen Elementen erteilt wurden, die anderen Harmonisierungsrechtsvorschriften der Union als der vorliegenden Verordnung unterliegen, bleiben bis zum 11. Juni 2028 gültig, sofern sie nicht vor diesem Zeitpunkt ablaufen oder sofern in anderen Harmonisierungsrechtsvorschriften der Union nichts anderes festgelegt ist; in letzterem Fall bleiben sie gemäß den letztgenannten Rechtsvorschriften gültig. (2) Produkte mit digitalen Elementen, die vor dem 11. Dezember 2027 in den Verkehr gebracht wurden, unterliegen den in dieser Verordnung festgelegten Anforderungen nur dann, wenn na…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da…
>
> *(2)* Mit dieser Verordnung sollen die Rahmenbedingungen für die Entwicklung sicherer Produkte mit digitalen Elementen geschaffen werden, damit Hardware- und Softwareprodukte mit weniger Schwachstellen in den Verkehr gebracht werden und damit sich die Hersteller während des gesamten Lebenszyklus eines Produkts konsequent um die Sicherheit kümmern. Außerdem sollen Bedingungen geschaffen werden, die es den Nutzern ermöglichen, bei der Auswahl und Verwendung von Produkten mit digitalen Elementen die Cybersicherheit zu berücksichtigen, beispielsweise durch mehr Transparenz in Bezug auf den Unterstützungszeitraum für auf dem Markt bereitgestellte Produkte mit digitalen Elementen.
>
> *(3)* Das geltende einschlägige Unionsrecht umfasst mehrere horizontale Vorschriften, die bestimmte Aspekte der Cybersicherheit aus unterschiedlichen Blickwinkeln regeln, darunter auch Maßnahmen zur Erhöhung der Sicherheit der digitalen Lieferkette. Das bestehende Unionsrecht in Bezug auf die Cybersicherheit, wozu die Verordnung (EU) 2019/881 des Europäischen Parlaments und des Rates (3) und die Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates (4) gehören, enthält jedoch keine unmittelbar verbindlichen Anforderungen an die Sicherheit von Produkten mit digitalen Elementen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`cra-de:art-69`</sub>

---

### 33 · data-act-en · Art. 1   *(Gegenprobe)*

**Subject matter and scope**

> 1. This Regulation lays down harmonised rules, inter alia, on: (a) the making available of product data and related service data to the user of the connected product or related service; (b) the making available of data by data holders to data recipients; (c) the making available of data by data holders to public sector bodies, the Commission, the European Central Bank and Union bodies, where there is an exceptional need for those data for the performance of a specific task carried out in the public interest; (d) facilitating switching between data processing services; (e) introducing safeguards against unlawful third-party access to non-personal data; and (f) the development of interoperabil…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In recent years, data-driven technologies have had transformative effects on all sectors of the economy. The proliferation of products connected to the internet in particular has increased the volume and potential value of data for consumers, businesses and society. High-quality and interoperable data from different domains increase competitiveness and innovation and ensure sustainable economic growth. The same data may be used and reused for a variety of purposes and to an unlimited degree, without any loss of quality or quantity.
>
> *(2)* Barriers to data sharing prevent an optimal allocation of data for the benefit of society. Those barriers include a lack of incentives for data holders to enter voluntarily into data sharing agreements, uncertainty about rights and obligations in relation to data, the costs of contracting and implementing technical interfaces, the high level of fragmentation of information in data silos, poor metadata management, the absence of standards for semantic and technical interoperability, bottlenecks impeding data access, a lack of common data sharing practices and the abuse of contractual imbalances with regard to data access and use.
>
> *(3)* In sectors characterised by the presence of microenterprises, small enterprises and medium-sized enterprises as defined in Article 2 of the Annex to Commission Recommendation 2003/361/EC (5) (SMEs), there is often a lack of digital capacities and skills to collect, analyse and use data, and access is frequently restricted where one actor holds them in the system or due to a lack of interoperability between data, between data services or across borders.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`data-act-en:art-1`</sub>

---

### 34 · dora · Art. 1   *(Gegenprobe)*

**Subject matter**

> 1. In order to achieve a high common level of digital operational resilience, this Regulation lays down uniform requirements concerning the security of network and information systems supporting the business processes of financial entities as follows: (a) requirements applicable to financial entities in relation to: (i) information and communication technology (ICT) risk management; (ii) reporting of major ICT-related incidents and notifying, on a voluntary basis, significant cyber threats to the competent authorities; (iii) reporting of major operational or security payment-related incidents to the competent authorities by financial entities referred to in Article 2(1), points (a) to (d); (…

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* In the digital age, information and communication technology (ICT) supports complex systems used for everyday activities. It keeps our economies running in key sectors, including the financial sector, and enhances the functioning of the internal market. Increased digitalisation and interconnectedness also amplify ICT risk, making society as a whole, and the financial system in particular, more vulnerable to cyber threats or ICT disruptions. While the ubiquitous use of ICT systems and high digitalisation and connectivity are today core features of the activities of Union financial entities, their digital resilience has yet to be better addressed and integrated into their broader operational frameworks.
>
> *(2)* The use of ICT has in the past decades gained a pivotal role in the provision of financial services, to the point where it has now acquired a critical importance in the operation of typical daily functions of all financial entities. Digitalisation now covers, for instance, payments, which have increasingly moved from cash and paper-based methods to the use of digital solutions, as well as securities clearing and settlement, electronic and algorithmic trading, lending and funding operations, peer-to-peer finance, credit rating, claim management and back-office operations. The insurance sector has also been transformed by the use of ICT, from the emergence of insurance intermediaries offering their services online operating with InsurTech, to digital insurance underwriting. Finance has not only become largely digital throughout the whole sector, but digitalisation has also deepened interconnections and dependencies within the financial sector and with third-party infrastructure and service providers.
>
> *(3)* The European Systemic Risk Board (ESRB) reaffirmed in a 2020 report addressing systemic cyber risk how the existing high level of interconnectedness across financial entities, financial markets and financial market infrastructures, and particularly the interdependencies of their ICT systems, could constitute a systemic vulnerability because localised cyber incidents could quickly spread from any of the approximately 22 000 Union financial entities to the entire financial system, unhindered by geographical boundaries. Serious ICT breaches that occur in the financial sector do not merely affect financial entities taken in isolation. They also smooth the way for the propagation of localised vulnerabilities across the financial transmission channels and potentially trigger adverse consequences for the stability of the Union’s financial system, such as generating liquidity runs and an overall loss of confidence and trust in financial markets.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dora:art-1`</sub>

---

### 35 · dsgvo · Art. 1   *(Gegenprobe)*

**Gegenstand und Ziele**

> (1) Diese Verordnung enthält Vorschriften zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten und zum freien Verkehr solcher Daten. (2) Diese Verordnung schützt die Grundrechte und Grundfreiheiten natürlicher Personen und insbesondere deren Recht auf Schutz personenbezogener Daten. (3) Der freie Verkehr personenbezogener Daten in der Union darf aus Gründen des Schutzes natürlicher Personen bei der Verarbeitung personenbezogener Daten weder eingeschränkt noch verboten werden.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Der Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten ist ein Grundrecht. Gemäß Artikel 8 Absatz 1 der Charta der Grundrechte der Europäischen Union (im Folgenden „Charta“) sowie Artikel 16 Absatz 1 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) hat jede Person das Recht auf Schutz der sie betreffenden personenbezogenen Daten.
>
> *(2)* Die Grundsätze und Vorschriften zum Schutz natürlicher Personen bei der Verarbeitung ihrer personenbezogenen Daten sollten gewährleisten, dass ihre Grundrechte und Grundfreiheiten und insbesondere ihr Recht auf Schutz personenbezogener Daten ungeachtet ihrer Staatsangehörigkeit oder ihres Aufenthaltsorts gewahrt bleiben. Diese Verordnung soll zur Vollendung eines Raums der Freiheit, der Sicherheit und des Rechts und einer Wirtschaftsunion, zum wirtschaftlichen und sozialen Fortschritt, zur Stärkung und zum Zusammenwachsen der Volkswirtschaften innerhalb des Binnenmarkts sowie zum Wohlergehen natürlicher Personen beitragen.
>
> *(3)* Zweck der Richtlinie 95/46/EG des Europäischen Parlaments und des Rates (4) ist die Harmonisierung der Vorschriften zum Schutz der Grundrechte und Grundfreiheiten natürlicher Personen bei der Datenverarbeitung sowie die Gewährleistung des freien Verkehrs personenbezogener Daten zwischen den Mitgliedstaaten.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`dsgvo:art-1`</sub>

---

## Nachrücker

Ersatz für die oben stillgelegten Fälle. Sie stehen hinten und nicht an der Lücke, weil die Urteile
an der *Position* hängen — ein Einschub in der Mitte würde jedes danach gefällte Urteil still an
einen anderen Artikel hängen.

### 36 · cra-de · Art. 11

**Allgemeine Produktsicherheit**

> Abweichend von Artikel 2 Absatz 1 Unterabsatz 3 Buchstabe b der Verordnung (EU) 2023/988 finden Kapitel III Abschnitt 1, Kapitel V und VII sowie die Kapitel IX bis XI der genannten Verordnung Anwendung auf Produkte mit digitalen Elementen in Bezug auf Aspekte und Risiken oder Risikokategorien, die nicht unter die vorliegende Verordnung fallen, sofern diese Produkte keinen besonderen Sicherheitsanforderungen unterliegen, die in anderen „Harmonisierungsrechtsvorschriften der Union“ im Sinne von Artikel 3 Nummer 27 der Verordnung (EU) 2023/988 festgelegt sind.

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da…
>
> *(2)* Mit dieser Verordnung sollen die Rahmenbedingungen für die Entwicklung sicherer Produkte mit digitalen Elementen geschaffen werden, damit Hardware- und Softwareprodukte mit weniger Schwachstellen in den Verkehr gebracht werden und damit sich die Hersteller während des gesamten Lebenszyklus eines Produkts konsequent um die Sicherheit kümmern. Außerdem sollen Bedingungen geschaffen werden, die es den Nutzern ermöglichen, bei der Auswahl und Verwendung von Produkten mit digitalen Elementen die Cybersicherheit zu berücksichtigen, beispielsweise durch mehr Transparenz in Bezug auf den Unterstützungszeitraum für auf dem Markt bereitgestellte Produkte mit digitalen Elementen.
>
> *(3)* Das geltende einschlägige Unionsrecht umfasst mehrere horizontale Vorschriften, die bestimmte Aspekte der Cybersicherheit aus unterschiedlichen Blickwinkeln regeln, darunter auch Maßnahmen zur Erhöhung der Sicherheit der digitalen Lieferkette. Das bestehende Unionsrecht in Bezug auf die Cybersicherheit, wozu die Verordnung (EU) 2019/881 des Europäischen Parlaments und des Rates (3) und die Richtlinie (EU) 2022/2555 des Europäischen Parlaments und des Rates (4) gehören, enthält jedoch keine unmittelbar verbindlichen Anforderungen an die Sicherheit von Produkten mit digitalen Elementen.
>
*Kein Erwägungsgrund verweist ausdrücklich auf diesen Artikel — gezeigt wird der Gesamtzweck.*

| | |
|---|---|
| **Urteil** | `A` / `B` / `C` / `D` →                      |
| **mehr als ein Adressat?** | `ja` / `nein` →                      |
| **Adressat(en) bei A oder B** |                                          |
| **Notiz** |                                          |

<sub>`cra-de:art-11`</sub>

---

## Auswertung (nach der Adjudikation ausfüllen)

| Urteil | Anzahl | |
|---|---|---|
| A — Rolle im Katalog, übersehen | | Extraktions-Qualität, gehört zu THE-421/432 |
| B — Rolle fehlt im Katalog | | **die gesuchte Zahl** |
| C — kein Adressat | | korrekt leer |
| D — unklar | | |

**Schwelle aus dem Ticket:** Mindestens ein fehlender Klassenkandidat mit **≥ 5** Bestimmungen belegt
→ Richtung A/C des Optionenblocks. Bleibt B unter der Schwelle, ist Option B (explizites
`noAddressee`) die ehrliche Antwort und der Rest eine Anzeigefrage.

**Hochrechnung:** Anteil B in der Stichprobe × 123 ≈ betroffene Bestimmungen im Korpus.
