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

> (1) Das Büro für Künstliche Intelligenz fördert und erleichtert die Ausarbeitung von Praxisleitfäden auf Unionsebene, um unter Berücksichtigung internationaler Ansätze zur ordnungsgemäßen Anwendung dieser Verordnung beizutragen. (2) Das Büro für Künstliche Intelligenz und das KI-Gremium streben an, sicherzustellen, dass die Praxisleitfäden mindestens die in den Artikeln 53 und 55 vorgesehenen Pflichten abdecken, einschließlich der folgenden Aspekte: a) Mittel, mit denen sichergestellt wird, dass die in Artikel 53 Absatz 1 Buchstaben a und b genannten Informationen vor dem Hintergrund der Marktentwicklungen und technologischen Entwicklungen auf dem neuesten Stand gehalten werden; b) die angemessene
>
> <details><summary>… gesamten Artikel ausklappen — noch 4.418 von 5.124 Zeichen</summary>
>
> Detailgenauigkeit bei der Zusammenfassung der für das Training verwendeten Inhalte; c) die Ermittlung von Art und Wesen der systemischen Risiken auf Unionsebene, gegebenenfalls einschließlich ihrer Ursachen; d) die Maßnahmen, Verfahren und Modalitäten für die Bewertung und das Management der systemischen Risiken auf Unionsebene, einschließlich ihrer Dokumentation, die in einem angemessenen Verhältnis zu den Risiken stehen, ihrer Schwere und Wahrscheinlichkeit Rechnung tragen und die spezifischen Herausforderungen bei der Bewältigung dieser Risiken vor dem Hintergrund der möglichen Arten der Entstehung und des Eintretens solcher Risiken entlang der KI-Wertschöpfungskette berücksichtigen. (3) Das Büro für Künstliche Intelligenz kann alle Anbieter von KI-Modellen mit allgemeinem Verwendungszweck sowie die einschlägigen zuständigen nationalen Behörden ersuchen, sich an der Ausarbeitung von Praxisleitfäden zu beteiligen. Organisationen der Zivilgesellschaft, die Industrie, die Wissenschaft und andere einschlägige Interessenträger wie nachgelagerte Anbieter und unabhängige Sachverständige können den Prozess unterstützen. (4) Das Büro für Künstliche Intelligenz und das KI-Gremium streben an, sicherzustellen, dass in den Praxisleitfäden ihre spezifischen Ziele eindeutig festgelegt sind und Verpflichtungen oder Maßnahmen, gegebenenfalls einschließlich wesentlicher Leistungsindikatoren, enthalten, um die Verwirklichung dieser Ziele gewährleisten, und dass sie den Bedürfnissen und Interessen aller interessierten Kreise, einschließlich betroffener Personen, auf Unionsebene gebührend Rechnung tragen. (5) Das Büro für Künstliche Intelligenz strebt an, sicherzustellen, dass die an Praxisleitfäden Beteiligten dem Büro für Künstliche Intelligenz regelmäßig über die Umsetzung der Verpflichtungen, die ergriffenen Maßnahmen und deren Ergebnisse, die gegebenenfalls auch anhand der wesentlichen Leistungsindikatoren gemessen werden, Bericht erstatten. Bei den wesentlichen Leistungsindikatoren und den Berichtspflichten wird den Größen- und Kapazitätsunterschieden zwischen den verschiedenen Beteiligten Rechnung getragen. (6) Das Büro für Künstliche Intelligenz und KI-Gremium überwachen und bewerten regelmäßig die Verwirklichung der Ziele der Praxisleitfäden durch die Beteiligten und deren Beitrag zur ordnungsgemäßen Anwendung dieser Verordnung. Das Büro für Künstliche Intelligenz und das KI-Gremium bewerten, ob die Praxisleitfäden die in den Artikeln 53 und 55 vorgesehenen Pflichten abdecken, und überwachen und bewerten regelmäßig die Verwirklichung von deren Zielen. Sie veröffentlichen ihre Bewertung der Angemessenheit der Praxisleitfäden. Die Kommission kann im Wege eines Durchführungsrechtsakts einen Praxisleitfaden genehmigen und ihm in der Union allgemeine Gültigkeit verleihen. Dieser Durchführungsrechtsakt wird gemäß dem in Artikel 98 Absatz 2 genannten Prüfverfahren erlassen. (7) Das Büro für Künstliche Intelligenz kann alle Anbieter von KI-Modellen mit allgemeinem Verwendungszweck ersuchen, die Praxisleitfäden zu befolgen. Für Anbieter von KI-Modellen mit allgemeinem Verwendungszweck, die keine systemischen Risiken bergen, kann diese Befolgung auf die in Artikel 53 vorgesehenen Pflichten beschränkt werden, es sei denn, sie erklären ausdrücklich ihr Interesse, sich dem ganzen Kodex anzuschließen. (8) Das Büro für Künstliche Intelligenz fördert und erleichtert gegebenenfalls auch die Überprüfung und Anpassung der Praxisleitfäden, insbesondere vor dem Hintergrund neuer Normen. Das Büro für Künstliche Intelligenz unterstützt bei der Bewertung der verfügbaren Normen. (9) Praxisleitfäden müssen spätestens am 2. Mai 2025 vorliegen. Das Büro für Künstliche Intelligenz unternimmt die erforderlichen Schritte, einschließlich des Ersuchens von Anbietern gemäß Absatz 7. Kann bis zum 2. August 2025 ein Verhaltenskodex nicht fertiggestellt werden oder erachtet das Büro für Künstliche Intelligenz dies nach seiner Bewertung gemäß Absatz 6 des vorliegenden Artikels für nicht angemessen, kann die Kommission im Wege von Durchführungsrechtsakten gemeinsame Vorschriften für die Umsetzung der in den Artikeln 53 und 55 vorgesehenen Pflichten, einschließlich der in Absatz 2 des vorliegenden Artikels genannten Aspekte, festlegen. Diese Durchführungsrechtsakte werden gemäß dem in Artikel 98 Absatz 2 genannten Prüfverfahren erlassen. KAPITEL VI MASSNAHMEN ZUR INNOVATIONSFÖRDERUNG
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur… [gekürzt — 1.200 von 1.972 Zeichen]
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

> (1) Ein Hersteller meldet jede aktiv ausgenutzte Schwachstelle, die in dem Produkt mit digitalen Elementen enthalten ist und von der er Kenntnis erlangt, gleichzeitig dem gemäß Absatz 7 als Koordinator benannten CSIRT und der ENISA. Der Hersteller meldet diese aktiv ausgenutzte Schwachstelle über die gemäß Artikel 16 eingerichtete einheitliche Meldeplattform. (2) Für die Zwecke der Mitteilung gemäß Absatz 1 legt der Hersteller Folgendes vor: a) unverzüglich, in jedem Fall aber innerhalb von 24 Stunden, nachdem der Hersteller davon Kenntnis erlangt hat, eine Frühwarnung über eine aktiv ausgenutzte Schwachstelle unter Angabe der Mitgliedstaaten, in deren Hoheitsgebiet das Produkt mit digitalen
>
> <details><summary>… gesamten Artikel ausklappen — noch 8.933 von 9.633 Zeichen</summary>
>
> Elementen des Herstellers seiner Kenntnis nach bereitgestellt wurde; b) sofern die einschlägigen Informationen nicht bereits vorgelegt wurden, unverzüglich, in jedem Fall aber innerhalb von 72 Stunden, nachdem der Hersteller Kenntnis von der aktiv ausgenutzten Schwachstelle erlangt hat, eine Meldung von Schwachstellen, die allgemeine Informationen, soweit verfügbar, über das betreffende Produkt mit digitalen Elementen, über die allgemeine Art der Ausnutzung und der betreffenden Schwachstelle sowie über alle ergriffenen Korrektur- oder Risikominderungsmaßnahmen sowie Korrektur- oder Abhilfemaßnahmen, die Nutzer ergreifen können, enthält und in der gegebenenfalls auch angegeben wird, als wie sensibel der Hersteller die gemeldeten Informationen ansieht; c) sofern die einschlägigen Informationen nicht bereits vorgelegt wurden, spätestens 14 Tage, nachdem eine Korrektur- oder Risikominderungsmaßnahme zur Verfügung steht, einen Abschlussbericht, der mindestens Folgendes enthält: i) eine Beschreibung der Schwachstelle, einschließlich ihres Schweregrads und ihrer Auswirkungen, ii) falls verfügbar, Informationen über jeden böswilligen Akteur, der die Schwachstelle ausgenutzt hat oder ausnutzt, iii) Informationen über die Sicherheitsaktualisierung oder andere Korrekturmaßnahmen, die zur Behebung der Schwachstelle zur Verfügung gestellt wurden. (3) Ein Hersteller meldet jeden schwerwiegenden Sicherheitsvorfall, der sich auf die Sicherheit des Produkts mit digitalen Elementen auswirkt und von der er Kenntnis erlangt, gleichzeitig dem gemäß Absatz 7 als Koordinator benannten CSIRT und der ENISA. Der Hersteller meldet diesen Sicherheitsvorfall über die gemäß Artikel 16 eingerichtete einheitliche Meldeplattform. (4) Für die Zwecke der Mitteilung gemäß Absatz 3 legt der Hersteller Folgendes vor: a) unverzüglich und in jedem Fall innerhalb von 24 Stunden, nachdem der Hersteller davon Kenntnis erlangt hat, eine Frühwarnung über einen schwerwiegenden Sicherheitsvorfall, der sich auf die Sicherheit des Produkts mit digitalen Elementen auswirkt, wobei zumindest anzugeben ist, ob der Verdacht besteht, dass der Sicherheitsvorfall auf rechtswidrige oder böswillige Handlungen zurückzuführen ist, wobei gegebenenfalls auch die Mitgliedstaaten anzugeben sind, in deren Hoheitsgebiet das Produkt mit digitalen Elementen des Herstellers seiner Kenntnis nach bereitgestellt wurde; b) sofern die einschlägigen Informationen nicht bereits übermittelt wurden, unverzüglich, in jedem Fall aber innerhalb von 72 Stunden, nachdem der Hersteller von dem Sicherheitsvorfall Kenntnis erlangt hat, eine Meldung des Sicherheitsvorfalls, die allgemeine Informationen, soweit verfügbar, über die Art des Sicherheitsvorfalls, eine erste Bewertung des Sicherheitsvorfalls sowie ergriffene Korrektur- oder Risikominderungsmaßnahmen und Korrektur- oder Abhilfemaßnahmen, die Nutzer ergreifen können, enthält und in der gegebenenfalls auch angegeben wird, als wie sensibel der Hersteller die gemeldeten Informationen ansieht; c) sofern die einschlägigen Informationen nicht bereits übermittelt wurden, innerhalb eines Monats nach Übermittlung der Meldung des Sicherheitsvorfalls gemäß Buchstabe b einen Abschlussbericht, der mindestens Folgendes enthält: i) eine ausführliche Beschreibung des Sicherheitsvorfalls, einschließlich seines Schweregrads und seiner Auswirkungen; ii) Angaben zur Art der Bedrohung bzw. zugrunde liegenden Ursache, die wahrscheinlich den Sicherheitsvorfall ausgelöst hat; iii) Angaben zu den getroffenen und laufenden Abhilfemaßnahmen. (5) Für die Zwecke von Absatz 3 gilt ein Sicherheitsvorfall, der Auswirkungen auf die Sicherheit des Produkts mit digitalen Elementen hat, als schwerwiegend, wenn a) er sich negativ auf die Fähigkeit eines Produkts mit digitalen Elementen auswirkt oder auswirken kann, die Verfügbarkeit, Authentizität, Integrität oder Vertraulichkeit von sensiblen oder wichtigen Daten oder Funktionen zu schützen, oder b) er zur Einführung oder Ausführung eines böswilligen Codes in einem Produkt mit digitalen Elementen oder im Netzwerk und Informationssystem eines Nutzers des Produkts mit digitalen Elementen geführt hat oder dazu führen kann. (6) Erforderlichenfalls kann das als Koordinator benannte CSIRT, dass ursprünglich die Meldung erhält, die Hersteller auffordern, einen Zwischenbericht über relevante Statusaktualisierungen über die aktiv genutzte Schwachstelle oder den schwerwiegenden Sicherheitsvorfall, der sich auf die Sicherheit des Produkts mit digitalen Elementen auswirkt, vorzulegen. (7) Die Meldungen gemäß den Absätzen 1 und 3 des vorliegenden Artikels werden über die in Artikel 16 genannte einheitliche Meldeplattform unter Verwendung eines der in Artikel 16 Absatz 1 genannten Endpunkte für die elektronische Meldung übermittelt. Die Meldung wird über den Endpunkt für die elektronische Meldung des CSIRT übermittelt, der als Koordinator des Mitgliedstaats benannt wurde, in dem die Hersteller ihre Hauptniederlassung in der Union haben, und ist gleichzeitig für die ENISA zugänglich. Für die Zwecke dieser Verordnung wird davon ausgegangen, dass ein Hersteller seine Hauptniederlassung in der Union in dem Mitgliedstaat hat, in dem die Entscheidungen im Zusammenhang mit der Cybersicherheit seiner Produkte mit digitalen Elementen überwiegend getroffen werden. Kann ein solcher Mitgliedstaat nicht bestimmt werden, so gilt als Mitgliedstaat der Hauptniederlassung der Mitgliedstaat, in dem der betreffende Hersteller die Niederlassung mit der höchsten Beschäftigtenzahl in der Union hat. Hat ein Hersteller keine Hauptniederlassung in der Union, so übermittelt er die in den Absätzen 1 und 3 genannten Meldungen unter Verwendung des Endpunkts für die elektronische Meldung des in dem Mitgliedstaat als Koordinator benannten CSIRT, der gemäß folgender Reihenfolge und auf der Grundlage der dem Hersteller zur Verfügung stehenden Informationen bestimmt wurde: a) der Mitgliedstaat, in dem der Bevollmächtigte niedergelassen ist, der für die meisten Produkte mit digitalen Elementen des Herstellers im Namen des Herstellers handelt; b) der Mitgliedstaat, in dem der Einführer niedergelassen ist, der die meisten Produkte mit digitalen Elementen dieses Herstellers in den Verkehr bringt; c) der Mitgliedstaat, in dem der Händler niedergelassen ist, der die meisten Produkte mit digitalen Elementen dieses Herstellers auf dem Markt bereitstellt; d) der Mitgliedstaat, in dem sich die meisten Nutzer von Produkten mit digitalen Elementen dieses Herstellers befinden. In Bezug auf Unterabsatz 3 Buchstabe d kann ein Hersteller Meldungen im Zusammenhang mit späteren aktiv ausgenutzten Schwachstellen oder schwerwiegenden Sicherheitsvorfällen, die sich auf die Sicherheit des Produkts mit digitalen Elementen auswirken, an dasselbe CSIRT richten, das als Koordinator benannt wurde und dem er zuerst Meldung erstattet hat. (8) Nachdem der Hersteller Kenntnis von einer aktiv ausgenutzten Schwachstelle oder einem schwerwiegenden Sicherheitsvorfall, der sich auf die Sicherheit des Produkts mit digitalen Elementen auswirkt, erlangt hat, informiert er die betroffenen Nutzer des Produkts mit digitalen Elementen und gegebenenfalls alle Nutzer über diese Schwachstelle oder diesen schwerwiegenden Sicherheitsvorfall und erforderlichenfalls über jegliche Risikominderungsmaßnahmen und Korrekturmaßnahmen, die die Nutzer ergreifen können, um die Auswirkungen dieser Schwachstellen oder Sicherheitsvorfälle zu mindern, gegebenenfalls in einem strukturierten, maschinenlesbaren Format, das leicht automatisch zu verarbeiten ist. Versäumt es der Hersteller, die Nutzer des Produkts mit digitalen Elementen rechtzeitig zu informieren, können die als Koordinatoren benannten CSIRTs diese Informationen den Nutzern zur Verfügung stellen, wenn sie dies für verhältnismäßig und erforderlich halten, um die Auswirkungen dieser Schwachstellen oder Sicherheitsvorfälle zu verhindern oder abzumildern. (9) Bis zum 11. Dezember 2025 erlässt die Kommission einen delegierten Rechtsakt gemäß Artikel 61 der vorliegenden Verordnung zur Ergänzung dieser Verordnung durch Festlegung der Modalitäten und Bedingungen für die Anwendung der Cybersicherheitsgründe im Zusammenhang mit der Verzögerung der Verbreitung von Meldungen gemäß Artikel 16 Absatz 2 der vorliegenden Verordnung. Die Kommission arbeitet bei der Ausarbeitung des Entwurfs des delegierten Rechtsakts mit dem gemäß Artikel 15 der Richtlinie (EU) 2022/2555 eingerichteten CSIRTs-Netzwerk und der ENISA zusammen. (10) Die Kommission kann im Wege von Durchführungsrechtsakten das Format und die Verfahren für die in diesem Artikel sowie in den Artikeln 15 und 16 genannten Meldungen präzisieren. Diese Durchführungsrechtsakte werden gemäß dem in Artikel 62 Absatz 2 genannten Prüfverfahren erlassen. Die Kommission arbeitet bei der Ausarbeitung der Entwürfe von Durchführungsrechtsakten mit dem CSIRTs-Netzwerk und der ENISA zusammen.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da… [gekürzt — 1.200 von 1.311 Zeichen]
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

> (1) Die ESA arbeiten über den Gemeinsamen Ausschuss Entwürfe technischer Regulierungsstandards aus, um Folgendes festzulegen: a) die Informationen, die von einem IKT-Drittdienstleister in dem Antrag bereitzustellen sind, in dem gemäß Artikel 31 Absatz 11 freiwillig um Einstufung als kritisch ersucht wird; b) Inhalt, Struktur und Format der Informationen, die IKT-Drittdienstleister gemäß Artikel 35 Absatz 1 übermitteln, offenlegen und melden müssen, einschließlich der Vorlage für die Bereitstellung von Informationen über die Vereinbarungen über die Unterauftragsvergabe; c) die Kriterien für die Festlegung der Zusammensetzung des gemeinsamen Untersuchungsteams, bei der eine ausgewogene Beteiligung
>
> <details><summary>… gesamten Artikel ausklappen — noch 784 von 1.488 Zeichen</summary>
>
> der Mitarbeiter der ESA und der jeweils zuständigen Behörden sicherzustellen ist, sowie ihrer Benennung, Aufgaben und Arbeitsvereinbarungen; d) die Einzelheiten der von den zuständigen Behörden vorgenommenen Bewertung der Maßnahmen, die von kritischen IKT-Drittdienstleistern auf der Grundlage der Empfehlungen der federführenden Überwachungsbehörde gemäß Artikel 42 Absatz 3 ergriffen wurden. (2) Die ESA legen der Kommission diese Entwürfe technischer Regulierungsstandards bis zum 17. Juli 2024 vor. Der Kommission wird die Befugnis übertragen, die vorliegende Verordnung durch Annahme technischer Regulierungsstandards nach Absatz 1 entsprechend dem Verfahren nach den Artikeln 10 bis 14 der Verordnungen (EU) Nr. 1093/2010, (EU) Nr. 1094/2010 und (EU) Nr. 1095/2010 zu ergänzen.
>
> </details>

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

> (1) Abweichend von Artikel 4 unterliegt ein als kleines Unternehmen oder als kleine Gruppe im Sinne von Artikel 3 Absatz 2 Unterabsatz 1 bzw. Artikel 3 Absatz 5 Unterabsatz 1 der Richtlinie 2013/34/EU eingestufter ESG-Rating-Anbieter (im Folgenden „kleiner ESG-Rating-Anbieter“), der in der Union niedergelassen ist und in der Union tätig werden möchte, nur Artikel 15 Absätzen 1, 5 und 7, Artikel 23 und 24 sowie den Artikeln 32 bis 37 der vorliegenden Verordnung, sofern er a) der ESMA seine Absicht mitteilt, in der Union tätig zu werden und b) von der ESMA vor Aufnahme seine Tätigkeit in der Union registriert wurde. (2) Innerhalb von 90 Arbeitstagen nach Eingang der in Absatz 1 Buchstabe a genannten
>
> <details><summary>… gesamten Artikel ausklappen — noch 1.125 von 1.831 Zeichen</summary>
>
> Mitteilung entscheidet die ESMA, ob der Anmelder als kleiner ESG-Rating-Anbieter registriert werden soll. Die ESMA unterrichtet den Anmelder innerhalb von fünf Arbeitstagen über ihre Entscheidung. (3) Wird ein in Absatz 1 dieses Artikels genannter kleiner ESG-Rating-Anbieter nicht mehr als kleines Unternehmen oder als kleine Gruppe eingestuft oder sind seit seiner Registrierung gemäß Absatz 1 Buchstabe b dieses Artikels drei Jahre vergangen — je nachdem, was zuerst eintritt —, so unterliegt der ESG-Rating-Anbieter den Bestimmungen dieser Verordnung und muss innerhalb von sechs Monaten eine Zulassung für eine Tätigkeit in der Union gemäß Kapitel 1 dieses Titels beantragen. (4) Die in Absatz 1 dieses Artikels genannten ESG-Ratinganbieter können sich dafür entscheiden, diese Verordnung auf freiwilliger Basis anzuwenden, indem sie bei der EMSA eine Zulassung gemäß Artikel 6 beantragen. Entscheiden sich ESG-Rating-Anbieter für eine freiwillige Anwendung, so gilt diese Verordnung in ihrer Gesamtheit für sie. KAPITEL 1 Zulassung von in der Union niedergelassenen ESG-Rating-Anbietern für eine Tätigkeit in der Union
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Am 25. September 2015 verabschiedete die Generalversammlung der Vereinten Nationen einen neuen globalen Rahmen zur nachhaltigen Entwicklung: die Agenda 2030 für nachhaltige Entwicklung (im Folgenden „Agenda 2030“), deren Kernstück die Ziele für nachhaltige Entwicklung sind. Die Mitteilung der Kommission vom 22. November 2016 mit dem Titel „Auf dem Weg in eine nachhaltige Zukunft: Europäische Nachhaltigkeitspolitik“ bindet die Nachhaltigkeitsziele in den politischen Rahmen der Union ein, um sicherzustellen, dass alle innen- und außenpolitischen Maßnahmen und Initiativen der Union diese Ziele von Beginn an mitberücksichtigen. In den Schlussfolgerungen des Europäischen Rates vom 22. und 23. Juni 2017 wurde die Entschlossenheit der Union und der Mitgliedstaaten bekräftigt, die Agenda 2030 vollständig, kohärent, umfassend, integrativ und wirksam und in enger Zusammenarbeit mit den Partnern und anderen Akteuren umzusetzen. Darüber hinaus haben zum Zeitpunkt des Erlasses dieser Verordnung über 5 300 Personen die von den Vereinten Nationen unterstützten Grundsätze für verantwortungsbewusstes Investment unterzeichnet, die ein verwaltetes Vermögen von über 120 Billionen EUR repräsentieren. D… [gekürzt — 1.200 von 1.655 Zeichen]
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
> *(2)* Ausgehend von einem hohen Gesundheitsschutzniveau für Patienten und Anwender soll mit der vorliegenden Verordnung ein reibungslos funktionierender Binnenmarkt für Medizinprodukte unter Berücksichtigung der in diesem Sektor tätigen kleinen und mittleren Unternehmen sichergestellt werden. Außerdem sind in dieser Verordnung hohe Standards für die Qualität und Sicherheit von Medizinprodukten festgelegt, durch die allgemeine Sicherheitsbedenken hinsichtlich dieser Produkte ausgeräumt werden sollen. Die beiden Ziele werden parallel verfolgt; sie sind untrennbar miteinander verbunden und absolut gleichrangig. Gestützt auf Artikel 114 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) wird mit dieser Verordnung eine Harmonisierung der Rechtsvorschriften für das Inverkehrbringen und die Inbetriebnahme von Medizinprodukten und ihrem Zubehör auf dem Unionsmarkt vorgenommen, denen dadurch der Grundsatz des freien Warenverkehrs zugute kommen kann. Im Sinne von Artikel 168 Absatz 4 Buchstabe c AEUV werden mit dieser Verordnung hohe Standards für Qualität und Sicherheit der Medizinprodukte festgelegt, indem unter anderem dafür gesorgt wird, dass die im Rahmen klinischer Prüfungen ge… [gekürzt — 1.200 von 1.343 Zeichen]
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

> 1. Where sector-specific Union legal acts require essential or important entities to adopt cybersecurity risk-management measures or to notify significant incidents and where those requirements are at least equivalent in effect to the obligations laid down in this Directive, the relevant provisions of this Directive, including the provisions on supervision and enforcement laid down in Chapter VII, shall not apply to such entities. Where sector-specific Union legal acts do not cover all entities in a specific sector falling within the scope of this Directive, the relevant provisions of this Directive shall continue to apply to the entities not covered by those sector-specific Union legal acts.
>
> <details><summary>… gesamten Artikel ausklappen — noch 976 von 1.677 Zeichen</summary>
>
> 2. The requirements referred to in paragraph 1 of this Article shall be considered to be equivalent in effect to the obligations laid down in this Directive where: (a) cybersecurity risk-management measures are at least equivalent in effect to those laid down in Article 21(1) and (2); or (b) the sector-specific Union legal act provides for immediate access, where appropriate automatic and direct, to the incident notifications by the CSIRTs, the competent authorities or the single points of contact under this Directive and where requirements to notify significant incidents are at least equivalent in effect to those laid down in Article 23(1) to (6) of this Directive. 3. The Commission shall, by 17 July 2023, provide guidelines clarifying the application of paragraphs 1 and 2. The Commission shall review those guidelines on a regular basis. When preparing those guidelines, the Commission shall take into account any observations of the Cooperation Group and ENISA.
>
> </details>

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

> Für die Zwecke dieser Richtlinie bezeichnet der Ausdruck: 1. „Herkunftsmitgliedstaat“ a) den Mitgliedstaat, in dem sich der Sitz des Zahlungsdienstleisters befindet, oder b) wenn der Zahlungsdienstleister nach dem für ihn geltenden nationalen Recht keinen Sitz hat, den Mitgliedstaat, in dem sich seine Hauptverwaltung befindet; 2. „Aufnahmemitgliedstaat“ den Mitgliedstaat, in dem ein Zahlungsdienstleister einen Agenten oder eine Zweigniederlassung hat oder Zahlungsdienste erbringt und der nicht der Herkunftsmitgliedstaat dieses Zahlungsdienstleisters ist; 3. „Zahlungsdienst“ eine oder mehrere der in Anhang I aufgeführten gewerblichen Tätigkeiten; 4. „Zahlungsinstitut“ eine juristische Person,
>
> <details><summary>… gesamten Artikel ausklappen — noch 10.910 von 11.610 Zeichen</summary>
>
> der nach Artikel 11 eine Zulassung für die unionsweite Erbringung und Ausführung von Zahlungsdiensten erteilt wurde; 5. „Zahlungsvorgang“ die bzw. den vom Zahler, im Namen des Zahlers oder vom Zahlungsempfänger ausgelöste(n) Bereitstellung, Transfer oder Abhebung eines Geldbetrags, unabhängig von etwaigen zugrunde liegenden Verpflichtungen im Verhältnis zwischen Zahler und Zahlungsempfänger; 6. „Fernzahlungsvorgang“ einen Zahlungsvorgang, der über das Internet oder mittels eines Geräts, das für die Fernkommunikation verwendet werden kann, ausgelöst wird; 7. „Zahlungssystem“ ein System zum Transfer von Geldbeträgen mit formalen und standardisierten Regeln und einheitlichen Vorschriften für die Verarbeitung, das Clearing und/oder die Verrechnung von Zahlungsvorgängen; 8. „Zahler“ eine natürliche oder juristische Person, die Inhaber eines Zahlungskontos ist und die einen Zahlungsauftrag von diesem Zahlungskonto gestattet oder — falls kein Zahlungskonto vorhanden ist — eine natürliche oder juristische Person, die den Auftrag für einen Zahlungsvorgang erteilt; 9. „Zahlungsempfänger“ eine natürliche oder juristische Person, die den Geldbetrag, der Gegenstand eines Zahlungsvorgangs ist, als Empfänger erhalten soll; 10. „Zahlungsdienstnutzer“ eine natürliche oder juristische Person, die einen Zahlungsdienst als Zahler oder Zahlungsempfänger oder in beiden Eigenschaften in Anspruch nimmt; 11. „Zahlungsdienstleister“ eine Stelle im Sinne des Artikels 1 Absatz 1 oder eine natürliche oder juristische Personen, für die die Ausnahme gemäß Artikel 32 oder 33 gilt; 12. „Zahlungskonto“ ein auf den Namen eines oder mehrerer Zahlungsdienstnutzer(s) lautendes Konto, das für die Ausführung von Zahlungsvorgängen genutzt wird; 13. „Zahlungsauftrag“ einen Auftrag, den ein Zahler oder Zahlungsempfänger seinem Zahlungsdienstleister zur Ausführung eines Zahlungsvorgangs erteilt; 14. „Zahlungsinstrument“ jedes personalisierte Instrument und/oder jeden personalisierten Verfahrensablauf, das bzw. der zwischen dem Zahlungsdienstnutzer und dem Zahlungsdienstleister vereinbart wurde und zur Erteilung eines Zahlungsauftrags verwendet wird; 15. „Zahlungsauslösedienst“ einen Dienst, der auf Antrag des Zahlungsdienstnutzers einen Zahlungsauftrag in Bezug auf ein bei einem anderen Zahlungsdienstleister geführtes Zahlungskonto auslöst; 16. „Kontoinformationsdienst“ einen Online-Dienst zur Mitteilung konsolidierter Informationen über ein Zahlungskonto oder mehrere Zahlungskonten, das/die ein Zahlungsdienstnutzer entweder bei einem anderen Zahlungsdienstleister oder bei mehr als einem Zahlungsdienstleister hält; 17. „kontoführender Zahlungsdienstleister“ einen Zahlungsdienstleister, der für einen Zahler ein Zahlungskonto bereitstellt und führt; 18. „Zahlungsauslösedienstleister“ einen Zahlungsdienstleister, der gewerbliche Tätigkeiten nach Anhang I Nummer 7 ausübt; 19. „Kontoinformationsdienstleister“ einen Zahlungsdienstleister, der gewerbliche Tätigkeiten nach Anhang I Nummer 8 ausübt; 20. „Verbraucher“ eine natürliche Person, die bei den von dieser Richtlinie erfassten Zahlungsdienstverträgen zu Zwecken handelt, die nicht ihrer gewerblichen oder beruflichen Tätigkeit zugerechnet werden können; 21. „Rahmenvertrag“ einen Zahlungsdienstvertrag, der die zukünftige Ausführung einzelner und aufeinander folgender Zahlungsvorgänge regelt und die Verpflichtung zur Einrichtung eines Zahlungskontos und die entsprechenden Bedingungen enthalten kann; 22. „Finanztransfer“ einen Zahlungsdienst, bei dem ohne Einrichtung eines Zahlungskontos auf den Namen des Zahlers oder des Zahlungsempfängers ein Geldbetrag eines Zahlers nur zum Transfer eines entsprechenden Betrags an einen Zahlungsempfänger oder an einen anderen, im Namen des Zahlungsempfängers handelnden Zahlungsdienstleister entgegengenommen wird und/oder bei dem der Geldbetrag im Namen des Zahlungsempfängers entgegengenommen und diesem verfügbar gemacht wird; 23. „Lastschrift“ einen Zahlungsdienst zur Belastung des Zahlungskontos des Zahlers, wenn ein Zahlungsvorgang vom Zahlungsempfänger aufgrund der Zustimmung des Zahlers gegenüber dem Zahlungsempfänger, dessen Zahlungsdienstleister oder seinem eigenen Zahlungsdienstleister ausgelöst wird; 24. „Überweisung“ einen auf Aufforderung des Zahlers ausgelösten Zahlungsdienst zur Erteilung einer Gutschrift auf das Zahlungskonto des Zahlungsempfängers zulasten des Zahlungskontos des Zahlers in Ausführung eines oder mehrerer Zahlungsvorgänge durch den Zahlungsdienstleister, der das Zahlungskonto des Zahlers führt; 25. „Geldbetrag“ Banknoten und Münzen, Giralgeld oder E-Geld im Sinne des Artikels 2 Nummer 2 der Richtlinie 2009/110/EG; 26. „Wertstellungsdatum“ den Zeitpunkt, den ein Zahlungsdienstleister für die Berechnung der Zinsen bei Gutschrift oder Belastung eines Betrags auf einem Zahlungskonto zugrunde legt; 27. „Referenzwechselkurs“ den Wechselkurs, der bei jedem Währungsumtausch zugrunde gelegt und vom Zahlungsdienstleister zugänglich gemacht wird oder aus einer öffentlich zugänglichen Quelle stammt; 28. „Referenzzinssatz“ den Zinssatz, der bei der Zinsberechnung zugrunde gelegt wird und aus einer öffentlich zugänglichen und für beide Parteien eines Zahlungsdienstvertrags überprüfbaren Quelle stammt; 29. „Authentifizierung“ ein Verfahren, mit dessen Hilfe der Zahlungsdienstleister die Identität eines Zahlungsdienstnutzers oder die berechtigte Verwendung eines bestimmten Zahlungsinstruments, einschließlich der Verwendung der personalisierten Sicherheitsmerkmale des Nutzers, überprüfen kann; 30. „starke Kundenauthentifizierung“ eine Authentifizierung unter Heranziehung von mindestens zwei Elementen der Kategorien Wissen (etwas, das nur der Nutzer weiß), Besitz (etwas, das nur der Nutzer besitzt) oder Inhärenz (etwas, das der Nutzer ist), die insofern voneinander unabhängig sind, als die Nichterfüllung eines Kriteriums die Zuverlässigkeit der anderen nicht in Frage stellt, und die so konzipiert ist, dass die Vertraulichkeit der Authentifizierungsdaten geschützt ist; 31. „personalisierte Sicherheitsmerkmale“ personalisierte Merkmale, die der Zahlungsdienstleister einem Zahlungsdienstnutzer zum Zwecke der Authentifizierung bereitstellt; 32. „sensible Zahlungsdaten“ Daten, einschließlich personalisierter Sicherheitsmerkmale, die für betrügerische Handlungen verwendet werden können. Für die Tätigkeiten von Zahlungsauslösedienstleistern und Kontoinformationsdienstleistern stellen der Name des Kontoinhabers und die Kontonummer keine sensiblen Zahlungsdaten dar; 33. „Kundenidentifikator“ eine Kombination aus Buchstaben, Zahlen oder Symbolen, die dem Zahlungsdienstnutzer vom Zahlungsdienstleister mitgeteilt wird und die der Zahlungsdienstnutzer angeben muss, damit ein anderer am Zahlungsvorgang beteiligter Zahlungsdienstnutzer und/oder dessen Zahlungskonto bei einem Zahlungsvorgang zweifelsfrei ermittelt werden kann; 34. „Fernkommunikationsmittel“ ein Verfahren, das ohne gleichzeitige körperliche Anwesenheit von Zahlungsdienstleister und Zahlungsdienstnutzer für den Abschluss eines Vertrags über die Erbringung von Zahlungsdiensten eingesetzt werden kann; 35. „dauerhafter Datenträger“ jedes Medium, das es dem Zahlungsdienstnutzer gestattet, an ihn persönlich gerichtete Informationen derart zu speichern, dass die Information für eine für die Zwecke der Informationen angemessene Dauer zugänglich bleibt, und das die unveränderte Wiedergabe der gespeicherten Informationen ermöglicht;; 36. „Kleinstunternehmen“ ein Unternehmen, das zum Zeitpunkt des Abschlusses des Zahlungsdienstvertrags ein Unternehmen im Sinne des Artikels 1 und des Artikels 2 Absätze 1 und 3 des Anhangs der Empfehlung 2003/361/EG ist; 37. „Geschäftstag“ einen Tag, an dem der an der Ausführung eines Zahlungsvorgangs beteiligte Zahlungsdienstleister des Zahlers bzw. des Zahlungsempfängers den für die Ausführung von Zahlungsvorgängen erforderlichen Geschäftsbetrieb unterhält; 38. „Agent“ eine natürliche oder juristische Person, die im Namen eines Zahlungsinstituts Zahlungsdienste ausführt; 39. „Zweigniederlassung“ eine Geschäftsstelle, die nicht die Hauptverwaltung ist und die einen Teil eines Zahlungsinstituts bildet, keine Rechtspersönlichkeit hat und unmittelbar sämtliche oder einen Teil der Geschäfte betreibt, die mit der Tätigkeit eines Zahlungsinstituts verbunden sind; alle Geschäftsstellen eines Kredit- bzw. Zahlungsinstituts mit Hauptverwaltung in einem anderen Mitgliedstaat, die sich in ein und demselben Mitgliedstaat befinden, gelten als eine einzige Zweigniederlassung; 40. „Gruppe“ eine Gruppe von Unternehmen, die untereinander durch eine in Artikel 22 Absätze 1, 2 oder 7 der Richtlinie 2013/34/EU genannte Beziehung verbunden sind, oder Unternehmen im Sinne der Artikel 4, 5, 6 und 7 der delegierten Verordnung (EU) Nr. 241/2014 der Kommission (29), die untereinander durch eine in Artikel 10 Absatz 1 oder Artikel 113 Absätze 6 oder 7 der Verordnung (EU) Nr. 575/2013 genannte Beziehung verbunden sind; 41. „elektronisches Kommunikationsnetz“ ein Netz im Sinne des Artikels 2 Buchstabe a der Richtlinie 2002/21/EG des Europäischen Parlaments und des Rates (30); 42. „elektronische Kommunikationsdienste“ ein Dienst im Sinne des Artikels 2 Buchstabe c der Richtlinie 2002/21/EG; 43. „digitale Inhalte“ Waren oder Dienstleistungen, die in digitaler Form hergestellt und bereitgestellt werden, deren Nutzung oder Verbrauch auf ein technisches Gerät beschränkt ist und die in keiner Weise die Nutzung oder den Verbrauch von Waren oder Dienstleistungen in physischer Form einschließen; 44. „Annahme und Abrechnung von Zahlungsvorgängen (Acquiring)“ einen den Transfer von Geldbeträgen zum Zahlungsempfänger bewirkenden Zahlungsdienst eines Zahlungsdienstleisters, der mit einem Zahlungsempfänger eine vertragliche Vereinbarung über die Annahme und die Verarbeitung von Zahlungsvorgängen schließt; 45. „Ausgabe von Zahlungsinstrumenten“ einen Zahlungsdienst, bei dem ein Zahlungsdienstleister eine vertragliche Vereinbarung schließt, um einem Zahler ein Zahlungsinstrument zur Auslösung und Verarbeitung der Zahlungsvorgänge des Zahlers zur Verfügung zu stellen; 46. „Eigenmittel“ Mittel im Sinne des Artikels 4 Absatz 1 Nummer 118 der Verordnung (EU) Nr. 575/2013, wobei mindestens 75 % des Kernkapitals in Form von hartem Kernkapital nach Artikel 50 der genannten Verordnung gehalten werden und das Ergänzungskapital höchstens ein Drittel des harten Kernkapitals beträgt; 47. „Zahlungsmarke“ jeder reale oder digitale Name, jeder reale oder digitale Begriff, jedes reale oder digitale Zeichen, jedes reale oder digitale Symbol oder jede Kombination davon, mittels dem oder der bezeichnet werden kann, unter welchem Zahlungskartensystem kartengebundene Zahlungsvorgänge ausgeführt werden; 48. „Co-badging“ das Aufnehmen von zwei oder mehr Zahlungsmarken oder Zahlungsanwendungen derselben Zahlungsmarke auf dasselbe Zahlungsinstrument.
>
> </details>

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

> (1) Die Kommission kann im Rahmen ihrer in den Verträgen festgelegten Befugnisse ein oder mehrere europäische Normungsorganisationen damit beauftragen, innerhalb einer vorgegebenen Frist eine europäische Norm oder ein Dokument der europäischen Normung zu erarbeiten. Europäische Normen und Dokumente der europäischen Normung müssen marktorientiert sein, dem öffentlichen Interesse und den in dem Auftrag der Kommission klar dargelegten politischen Zielen Rechnung tragen und auf Konsens gegründet sein. Die Kommission legt die Anforderungen an den Inhalt des in Auftrag gegebenen Dokuments und einen Termin für dessen Annahme fest. (2) Die Entscheidungen nach Absatz 1 sind gemäß dem in Artikel 22 Absatz
>
> <details><summary>… gesamten Artikel ausklappen — noch 1.699 von 2.403 Zeichen</summary>
>
> 3 genannten Verfahren und nach Konsultation der europäischen Normungsorganisationen und den europäischen Organisationen von Interessenträgern, die von der Union nach Maßgabe dieser Verordnung finanziert werden, und des durch die entsprechenden Rechtsvorschriften der Union eingesetzten Ausschusses, soweit ein solcher Ausschuss besteht, oder nach einer sonstigen Konsultation von Experten des jeweiligen Sektors zu verabschieden. (3) Die betreffende europäische Normungsorganisation erklärt innerhalb eines Monats nach Eingang des in Absatz 1 genannten Auftrags, ob sie ihn annimmt. (4) Liegt ein Antrag auf Finanzierung vor, unterrichtet die Kommission die betreffenden europäischen Normungsorganisationen innerhalb von zwei Monaten nach Eingang der in Absatz 3 genannten Auftragsannahme über die Gewährung eines Zuschusses für die Erstellung des Entwurfs einer europäischen Norm oder eines Dokuments der europäischen Normung. (5) Die europäischen Normungsorganisationen unterrichten die Kommission über die Tätigkeiten für die Erarbeitung der in Absatz 1 genannten Schriftstücke. Die Kommission prüft gemeinsam mit den europäischen Normungsorganisationen die Übereinstimmung der von den europäischen Normungsorganisationen erarbeiteten Schriftstücke mit ihrem ursprünglichen Auftrag. (6) Wenn eine harmonisierte Norm den Anforderungen genügt, die sie abdecken soll und die in dem entsprechenden Harmonisierungsrechtsvorschriften der Union festgelegt sind, veröffentlicht die Kommission unverzüglich eine Fundstelle einer solchen harmonisierten Norm im Amtsblatt der Europäischen Union oder durch andere Mittel nach Maßgabe der Bedingungen in dem entsprechenden Harmonisierungsrechtsakt der Union.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Das Hauptziel von Normung ist die Festlegung freiwilliger technischer oder die Qualität betreffender Spezifikationen, denen bereits bestehende oder künftige Produkte, Produktionsverfahren oder Dienstleistungen entsprechen können. Normung erstreckt sich über unterschiedliche Bereiche, beispielsweise die Normung unterschiedlicher Ausführungen oder Größen eines Produkts oder technische Spezifikationen in Produkt- oder Dienstleistungsmärkten, bei denen die Kompatibilität und Interoperabilität mit anderen Produkten oder Systemen unerlässlich sind.
>
> *(2)* Die europäische Normung wird durch und für die einschlägigen Interessenträger organisiert, und zwar auf der Grundlage nationaler Vertretung (Europäisches Komitee für Normung (CEN) und das Europäisches Komitee für Elektrotechnische Normung (Cenelec)) und direkter Beteiligung (Europäisches Institut für Telekommunikationsnormen (ETSI)), und sie stützt sich auf die von der Welthandelsorganisation (WTO) anerkannten Grundsätze auf dem Gebiet der Normung, nämlich Kohärenz, Transparenz, Offenheit, Konsens, Freiwilligkeit der Anwendung, Unabhängigkeit von Einzelinteressen und Effizienz (im Folgenden „Grundprinzipien“). Nach den Grundprinzipien ist es wichtig, dass alle interessierten Kreise, einschließlich der Behörden und der kleineren und mittleren Unternehmen (KMU), angemessen in den nationalen und europäischen Normungsprozess einbezogen werden. Die nationalen Normungsorganisationen sollten außerdem die Mitwirkung von Interessenträgern fördern und erleichtern.
>
> *(3)* Die europäische Normung trägt ferner dazu bei, die Wettbewerbsfähigkeit der Unternehmen zu verbessern, indem sie insbesondere den freien Verkehr von Waren und Dienstleistungen, die Interoperabilität von Netzwerken, Kommunikationsmittel sowie die technologische Entwicklung und die Innovation vereinfacht. Durch die europäische Normung wird die weltweite Wettbewerbsfähigkeit der europäischen Industrie besonders dann gestärkt, wenn sie in Koordination mit den internationalen Normungsorganisationen, d. h. der Internationalen Organisation für Normung (ISO), der Internationalen Elektrotechnischen Kommission (IEC) und der Internationalen Fernmeldeunion (ITU), erfolgt. Normen haben eindeutig positive Auswirkungen auf die Wirtschaft, indem sie unter anderem die wirtschaftliche Durchdringung im Binnenmarkt fördern und zur Entwicklung neuer und verbesserter Produkte und Märkte sowie besserer Lieferbedingungen beitragen. Normen führen daher in der Regel zu einem stärkeren Wettbewerb und niedrigeren Output- und Verkaufskosten, was den Volkswirtschaften insgesamt und besonders den Verbrauchern zugute kommt. Normen leisten einen Beitrag zur Aufrechterhaltung und Verbesserung von Qualität, sind ein… [gekürzt — 1.200 von 1.343 Zeichen]
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

> (1) Um eine Zersplitterung in der Union zu vermeiden, erlässt die Kommission Durchführungsrechtsakte, in denen detaillierte Regelungen für die Einrichtung, Entwicklung, Umsetzung, den Betrieb und die Beaufsichtigung der KI-Reallabore enthalten sind. In den Durchführungsrechtsakten sind gemeinsame Grundsätze zu den folgenden Aspekten festgelegt: a) Voraussetzungen und Auswahlkriterien für eine Beteiligung am KI-Reallabor; b) Verfahren für Antragstellung, Beteiligung, Überwachung, Ausstieg und Beendigung bezüglich des KI-Reallabors, einschließlich Plan und Abschlussbericht für das Reallabor; c) für Beteiligte geltende Anforderungen und Bedingungen. Diese Durchführungsrechtsakte werden gemäß dem
>
> <details><summary>… gesamten Artikel ausklappen — noch 4.209 von 4.910 Zeichen</summary>
>
> in Artikel 98 Absatz 2 genannten Prüfverfahren erlassen. (2) Die in Absatz 1 genannten Durchführungsrechtsakte gewährleisten, a) dass KI-Reallabore allen Anbietern oder zukünftigen Anbietern eines KI-Systems, die einen Antrag stellen und die Voraussetzungen und Auswahlkriterien erfüllen, offen stehen; diese Voraussetzungen und Kriterien sind transparent und fair und die zuständigen nationalen Behörden informieren die Antragsteller innerhalb von drei Monaten nach Antragstellung über ihre Entscheidung; b) dass die KI-Reallabore einen breiten und gleichberechtigten Zugang ermöglichen und mit der Nachfrage nach Beteiligung Schritt halten; die Anbieter und zukünftigen Anbieter auch Anträge zusammen mit Betreibern oder einschlägigen Dritten, die ihre Partner sind, stellen können; c) dass die detaillierten Regelungen und Bedingungen für KI-Reallabore so gut wie möglich die Flexibilität der zuständigen nationalen Behörden bei der Einrichtung und dem Betrieb ihrer KI-Reallabore unterstützen; d) dass der Zugang zu KI-Reallaboren für KMU, einschließlich Start-up-Unternehmen, kostenlos ist, unbeschadet außergewöhnlicher Kosten, die die zuständigen nationalen Behörden in einer fairen und verhältnismäßigen Weise einfordern können; e) dass den Anbietern und zukünftigen Anbietern die Einhaltung der Verpflichtungen zur Konformitätsbewertung nach dieser Verordnung oder die freiwillige Anwendung der in Artikel 95 genannten Verhaltenskodizes mittels der gewonnenen Erkenntnisse der KI-Reallabore erleichtert wird; f) dass KI-Reallabore die Einbeziehung anderer einschlägiger Akteure innerhalb des KI-Ökosystems, wie etwa notifizierte Stellen und Normungsorganisationen, KMU, einschließlich Start-up-Unternehmen, Unternehmen, Innovatoren, Test- und Versuchseinrichtungen, Forschungs- und Versuchslabore, europäische digitale Innovationszentren, Kompetenzzentren und einzelne Forscher begünstigen, um die Zusammenarbeit mit dem öffentlichen und dem privaten Sektor zu ermöglichen und zu erleichtern; g) dass die Verfahren, Prozesse und administrativen Anforderungen für die Antragstellung, die Auswahl, die Beteiligung und den Ausstieg aus dem KI-Reallabor einfach, leicht verständlich und klar kommuniziert sind, um die Beteiligung von KMU, einschließlich Start-up-Unternehmen, mit begrenzten rechtlichen und administrativen Kapazitäten zu erleichtern, sowie unionsweit gestrafft sind, um eine Zersplitterung zu vermeiden, und dass die Beteiligung an einem von einem Mitgliedstaat oder dem Europäischen Datenschutzbeauftragten eingerichteten KI-Reallabor gegenseitig und einheitlich anerkannt wird und in der gesamten Union die gleiche Rechtswirkung hat; h) dass die Beteiligung an dem KI-Reallabor auf einen der Komplexität und dem Umfang des Projekts entsprechenden Zeitraum beschränkt ist, der von der zuständigen nationalen Behörde verlängert werden kann; i) dass die KI-Reallabore die Entwicklung von Instrumenten und Infrastruktur für das Testen, das Benchmarking, die Bewertung und die Erklärung der Dimensionen von KI-Systemen erleichtern, die für das regulatorische Lernen Bedeutung sind, wie etwa Genauigkeit, Robustheit und Cybersicherheit, sowie Maßnahmen zur Risikominderung im Hinblick auf die Grundrechte und die Gesellschaft als Ganzes fördern. (3) Zukünftige Anbieter in den KI-Reallaboren, insbesondere KMU und Start-up-Unternehmen, werden gegebenenfalls vor der Einrichtung an Dienste verwiesen, die beispielsweise eine Anleitung zur Umsetzung dieser Verordnung oder andere Mehrwertdienste wie Hilfe bei Normungsdokumenten bereitstellen, sowie an Zertifizierungs-, Test- und Versuchseinrichtungen, europäische digitale Innovationszentren und Exzellenzzentren. (4) Wenn zuständige nationale Behörden in Betracht ziehen, Tests unter Realbedingungen zu genehmigen, die im Rahmen eines KI-Reallabors beaufsichtigt werden, welches nach diesem Artikel einzurichten ist, vereinbaren sie mit den Beteiligten ausdrücklich die Anforderungen und Bedingungen für diese Tests und insbesondere geeignete Schutzvorkehrungen für Grundrechte, Gesundheit und Sicherheit. Gegebenenfalls arbeiten sie mit anderen zuständigen nationalen Behörden zusammen, um für unionsweit einheitliche Verfahren zu sorgen.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur… [gekürzt — 1.200 von 1.972 Zeichen]
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

> (1) Hersteller sowie andere natürliche oder juristische Personen können jede in einem Produkt mit digitalen Elementen enthaltene Schwachstelle sowie Cyberbedrohungen, die sich auf das Risikoprofil eines Produkts mit digitalen Elementen auswirken könnten, freiwillig einem als Koordinator benannten CSIRT oder der ENISA melden. (2) Hersteller sowie andere natürliche oder juristische Personen können jeden Sicherheitsvorfall, der sich auf die Sicherheit des Produkts mit digitalen Elementen auswirkt, sowie Beinahe-Vorfälle, die zu einem solchen Sicherheitsvorfall hätten führen können, auf freiwilliger Basis einem als Koordinator benannten CSIRT oder der ENISA melden. (3) Das als Koordinator benannte
>
> <details><summary>… gesamten Artikel ausklappen — noch 1.096 von 1.798 Zeichen</summary>
>
> CSIRT oder die ENISA bearbeitet die in den Absätze 1 und 2 genannten Meldungen nach dem in Artikel 16 vorgesehenen Verfahren. Das als Koordinator benannte CSIRT kann verpflichtende Meldungen vorrangig vor freiwilligen Meldungen bearbeiten. (4) Meldet eine andere natürliche oder juristische Person als der Hersteller gemäß Absatz 1 oder 2 eine aktiv ausgenutzte Schwachstelle oder einen schwerwiegenden Sicherheitsvorfall mit Auswirkungen auf die Sicherheit eines Produkts mit digitalen Elementen, so unterrichtet das als Koordinator benannte CSIRT den Hersteller unverzüglich. (5) Die als Koordinator benannten CSIRTs und die ENISA stellen die Vertraulichkeit und den angemessenen Schutz der von einer meldenden natürlichen oder juristischen Person übermittelten Informationen sicher. Unbeschadet der Verhütung, Ermittlung, Aufdeckung und Verfolgung von Straftaten dürfen die freiwilligen Meldungen nicht dazu führen, dass der meldenden natürlichen oder juristischen Person zusätzliche Pflichten auferlegt werden, die nicht für sie gegolten hätten, wenn sie die Meldung nicht übermittelt hätte.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da… [gekürzt — 1.200 von 1.311 Zeichen]
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

> 1. The European Data Protection Board (the ‘Board’) is hereby established as a body of the Union and shall have legal personality. 2. The Board shall be represented by its Chair. 3. The Board shall be composed of the head of one supervisory authority of each Member State and of the European Data Protection Supervisor, or their respective representatives. 4. Where in a Member State more than one supervisory authority is responsible for monitoring the application of the provisions pursuant to this Regulation, a joint representative shall be appointed in accordance with that Member State's law. 5. The Commission shall have the right to participate in the activities and meetings of the Board without
>
> <details><summary>… gesamten Artikel ausklappen — noch 438 von 1.142 Zeichen</summary>
>
> voting right. The Commission shall designate a representative. The Chair of the Board shall communicate to the Commission the activities of the Board. 6. In the cases referred to in Article 65, the European Data Protection Supervisor shall have voting rights only on decisions which concern principles and rules applicable to the Union institutions, bodies, offices and agencies which correspond in substance to those of this Regulation.
>
> </details>

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

> (1) Ordnungswidrig handelt, wer vorsätzlich oder fahrlässig 1.entgegen § 4 Absatz 3 Satz 1 nicht dafür sorgt, dass eine dort genannte Festlegung getroffen ist,2.entgegen § 5 Absatz 1 Satz 1 oder § 9 Absatz 3 Nummer 1 eine Risikoanalyse nicht, nicht richtig, nicht vollständig oder nicht rechtzeitig durchführt,3.entgegen § 6 Absatz 1 eine Präventionsmaßnahme nicht oder nicht rechtzeitig ergreift,4.entgegen § 6 Absatz 5 Satz 1, § 7 Absatz 4 Satz 1 oder § 8 Absatz 5 Satz 1 eine Überprüfung nicht oder nicht rechtzeitig vornimmt,5.entgegen § 6 Absatz 5 Satz 3, § 7 Absatz 4 Satz 3 oder § 8 Absatz 5 Satz 2 eine Maßnahme nicht oder nicht rechtzeitig aktualisiert,6.entgegen § 7 Absatz 1 Satz 1 eine Abhilfemaßnahme
>
> <details><summary>… gesamten Artikel ausklappen — noch 3.864 von 4.577 Zeichen</summary>
>
> nicht oder nicht rechtzeitig ergreift,7.entgegen a)§ 7 Absatz 2 Satz 1 oderb)§ 9 Absatz 3 Nummer 3ein Konzept nicht oder nicht rechtzeitig erstellt oder nicht oder nicht rechtzeitig umsetzt,8.entgegen § 8 Absatz 1 Satz 1, auch in Verbindung mit § 9 Absatz 1, nicht dafür sorgt, dass ein Beschwerdeverfahren eingerichtet ist,9.entgegen § 10 Absatz 1 Satz 2 eine Dokumentation nicht oder nicht mindestens sieben Jahre aufbewahrt,10.entgegen § 10 Absatz 2 Satz 1 einen Bericht nicht richtig erstellt,11.entgegen § 10 Absatz 2 Satz 1 einen dort genannten Bericht nicht oder nicht rechtzeitig öffentlich zugänglich macht,12.entgegen § 12 einen Bericht nicht oder nicht rechtzeitig einreicht oder13.einer vollziehbaren Anordnung nach § 13 Absatz 2 oder § 15 Satz 2 Nummer 2 zuwiderhandelt. (2) Die Ordnungswidrigkeit kann geahndet werden 1.in den Fällen des Absatzes 1 a)Nummer 3, 7 Buchstabe b und Nummer 8b)Nummer 6 und 7 Buchstabe amit einer Geldbuße bis zu achthunderttausend Euro,2.in den Fällen des Absatzes 1 Nummer 1, 2, 4, 5 und 13 mit einer Geldbuße bis zu fünfhunderttausend Euro und3.in den übrigen Fällen des Absatzes 1 mit einer Geldbuße bis zu hunderttausend Euro.In den Fällen des Satzes 1 Nummer 1 und 2 ist § 30 Absatz 2 Satz 3 des Gesetzes über Ordnungswidrigkeiten anzuwenden. (3) Bei einer juristischen Person oder Personenvereinigung mit einem durchschnittlichen Jahresumsatz von mehr als 400 Millionen Euro kann abweichend von Absatz 2 Satz 2 in Verbindung mit Satz 1 Nummer 1 Buchstabe b eine Ordnungswidrigkeit nach Absatz 1 Nummer 6 oder 7 Buchstabe a mit einer Geldbuße bis zu 2 Prozent des durchschnittlichen Jahresumsatzes geahndet werden. Bei der Ermittlung des durchschnittlichen Jahresumsatzes der juristischen Person oder Personenvereinigung ist der weltweite Umsatz aller natürlichen und juristischen Personen sowie aller Personenvereinigungen der letzten drei Geschäftsjahre, die der Behördenentscheidung vorausgehen, zugrunde zu legen, soweit diese Personen und Personenvereinigungen als wirtschaftliche Einheit operieren. Der durchschnittliche Jahresumsatz kann geschätzt werden. (4) Grundlage für die Bemessung der Geldbuße bei juristischen Personen und Personenvereinigungen ist die Bedeutung der Ordnungswidrigkeit. Bei der Bemessung sind die wirtschaftlichen Verhältnisse der juristischen Person oder Personenvereinigung zu berücksichtigen. Bei der Bemessung sind die Umstände, insoweit sie für und gegen die juristische Person oder Personenvereinigung sprechen, gegeneinander abzuwägen. Dabei kommen insbesondere in Betracht: 1.der Vorwurf, der den Täter der Ordnungswidrigkeit trifft,2.die Beweggründe und Ziele des Täters der Ordnungswidrigkeit,3.Gewicht, Ausmaß und Dauer der Ordnungswidrigkeit,4.Art der Ausführung der Ordnungswidrigkeit, insbesondere die Anzahl der Täter und deren Position in der juristischen Person oder Personenvereinigung,5.die Auswirkungen der Ordnungswidrigkeit,6.vorausgegangene Ordnungswidrigkeiten, für die die juristische Person oder Personenvereinigung nach § 30 des Gesetzes über Ordnungswidrigkeiten, auch in Verbindung mit § 130 des Gesetzes über Ordnungswidrigkeiten, verantwortlich ist, sowie vor der Ordnungswidrigkeit getroffene Vorkehrungen zur Vermeidung und Aufdeckung von Ordnungswidrigkeiten,7.das Bemühen der juristischen Person oder Personenvereinigung, die Ordnungswidrigkeit aufzudecken und den Schaden wiedergutzumachen, sowie nach der Ordnungswidrigkeit getroffene Vorkehrungen zur Vermeidung und Aufdeckung von Ordnungswidrigkeiten,8.die Folgen der Ordnungswidrigkeit, die die juristische Person oder Personenvereinigung getroffen haben. (5) Verwaltungsbehörde im Sinne des § 36 Absatz 1 Nummer 1 des Gesetzes über Ordnungswidrigkeiten ist das Bundesamt für Wirtschaft und Ausfuhrkontrolle. Für die Rechts- und Fachaufsicht über das Bundesamt gilt § 19 Absatz 1 Satz 2 und 3.
>
> </details>

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
> *(2)* Ausgehend von einem hohen Gesundheitsschutzniveau für Patienten und Anwender soll mit der vorliegenden Verordnung ein reibungslos funktionierender Binnenmarkt für Medizinprodukte unter Berücksichtigung der in diesem Sektor tätigen kleinen und mittleren Unternehmen sichergestellt werden. Außerdem sind in dieser Verordnung hohe Standards für die Qualität und Sicherheit von Medizinprodukten festgelegt, durch die allgemeine Sicherheitsbedenken hinsichtlich dieser Produkte ausgeräumt werden sollen. Die beiden Ziele werden parallel verfolgt; sie sind untrennbar miteinander verbunden und absolut gleichrangig. Gestützt auf Artikel 114 des Vertrags über die Arbeitsweise der Europäischen Union (AEUV) wird mit dieser Verordnung eine Harmonisierung der Rechtsvorschriften für das Inverkehrbringen und die Inbetriebnahme von Medizinprodukten und ihrem Zubehör auf dem Unionsmarkt vorgenommen, denen dadurch der Grundsatz des freien Warenverkehrs zugute kommen kann. Im Sinne von Artikel 168 Absatz 4 Buchstabe c AEUV werden mit dieser Verordnung hohe Standards für Qualität und Sicherheit der Medizinprodukte festgelegt, indem unter anderem dafür gesorgt wird, dass die im Rahmen klinischer Prüfungen ge… [gekürzt — 1.200 von 1.343 Zeichen]
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

> (1) Die EBA arbeitet im Einklang mit Artikel 10 der Verordnung (EU) Nr. 1093/2010 in enger Zusammenarbeit mit der EZB und nach Anhörung aller maßgeblichen Akteure, einschließlich des Zahlungsverkehrsmarktes, unter Berücksichtigung der Interessen aller Beteiligten für Zahlungsdienstleister im Sinne des Artikels 1 Absatz 1 dieser Richtlinie technische Regulierungsstandards aus, in denen Folgendes präzisiert wird: a) die Erfordernisse des Verfahrens zur starken Kundenauthentifizierung gemäß Artikel 97 Absätze 1 und 2, b) die Ausnahmen von der Anwendung des Artikels 97 Absätze 1, 2 und 3 unter Zugrundelegung der Kriterien des Absatzes 3 dieses Artikels, c) die Anforderungen, die Sicherheitsmaßnahmen
>
> <details><summary>… gesamten Artikel ausklappen — noch 2.208 von 2.912 Zeichen</summary>
>
> gemäß Artikel 97 Absatz 3 erfüllen müssen, um die Vertraulichkeit und die Integrität der personalisierten Sicherheitsmerkmale der Zahlungsdienstnutzer zu schützen, und d) die Anforderungen an gemeinsame und sichere offene Standards für die Kommunikation zwischen kontoführenden Zahlungsdienstleistern, Zahlungsauslösedienstleistern, Kontoinformationsdienstleistern, Zahlern, Zahlungsempfängern und anderen Zahlungsdienstleistern zum Zwecke der Identifizierung, der Authentifizierung, der Meldung und der Weitergabe von Informationen sowie der Anwendung von Sicherheitsmaßnahmen. (2) Die Entwürfe technischer Regulierungsstandards gemäß Absatz 1 werden von der EBA mit folgender Zielsetzung ausgearbeitet: a) Sicherstellung eines angemessenen Sicherheitsniveaus für Zahlungsdienstnutzer und Zahlungsdienstleister durch die Festlegung wirksamer und risikobasierter Anforderungen, b) Gewährleistung der Sicherheit für die Gelder und die personenbezogenen Daten der Zahlungsdienstnutzer, c) Sicherstellung und Aufrechterhaltung eines fairen Wettbewerbs zwischen allen Zahlungsdienstleistern, d) Gewährleistung der Neutralität im Hinblick auf die Technologie und das Geschäftsmodell, e) Ermöglichung der Entwicklung benutzerfreundlicher, allgemein zugänglicher und innovativer Zahlungsmittel. (3) Die Ausnahmen nach Absatz 1 Buchstabe b werden unter Zugrundelegung folgender Kriterien gewährt: a) mit der Dienstleistung verbundenes Risikoniveau, b) der Betrag des Zahlungsvorgangs oder dessen Periodizität, oder beide, c) für die Ausführung des Zahlungsvorgangs genutzter Zahlungsweg. (4) Die EBA übermittelt der Kommission diese in Absatz 1 genannten Entwürfe technischer Regulierungsstandards bis zum 13. Januar 2017. Der Kommission wird die Befugnis übertragen, die technischen Regulierungsstandards gemäß den Artikeln 10 bis 14 der Verordnung (EU) Nr. 1093/2010 zu erlassen. (5) Gemäß Artikel 10 der Verordnung (EU) Nr. 1093/2010 überprüft und aktualisiert die EBA — soweit erforderlich — die technischen Regulierungsstandards regelmäßig, um unter anderem der Innovation und den technologischen Entwicklungen Rechnung zu tragen. KAPITEL 6 Alternative Streitbeilegungsverfahren Abschnitt 1 Beschwerdeverfahren
>
> </details>

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

> (1) Die Kommission kann entweder auf den Vorschlag eines Mitgliedstaats hin oder auf eigene Initiative entscheiden, technische IKT-Spezifikationen zu identifizieren, bei denen es sich nicht um nationale, europäische oder internationale Normen handelt, die jedoch die in Anhang II genannten Anforderungen erfüllen und auf die hauptsächlich zur Herbeiführung der Interoperabilität bei der Vergabe öffentlicher Aufträge Bezug genommen werden kann. (2) Wenn eine gemäß Absatz 1 identifizierten technische IKT-Spezifikation geändert oder zurückgezogen wird oder den Anforderungen des Anhangs II nicht mehr genügt, kann die Kommission entweder auf den Vorschlag eines Mitgliedstaats hin oder auf eigene Initiative
>
> <details><summary>… gesamten Artikel ausklappen — noch 639 von 1.346 Zeichen</summary>
>
> entscheiden, die geänderte technische IKT-Spezifikation zu identifizieren oder die Identifizierung zurückzuziehen. (3) Die in den Absätzen 1 und 2 genannten Entscheidungen sind zu treffen nach Konsultation der europäischen Multi-Stakeholder-Plattform für die IKT-Normung, der europäische Normungsorganisationen, Mitgliedstaaten und einschlägige Interessenträger angehören, sowie nach Konsultation des durch die entsprechenden Rechtsvorschriften der Union eingesetzten Ausschusses, soweit ein solcher Ausschuss besteht, oder nach einer sonstigen Konsultation von Experten des jeweiligen Sektors, soweit ein solcher Ausschuss nicht besteht.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Das Hauptziel von Normung ist die Festlegung freiwilliger technischer oder die Qualität betreffender Spezifikationen, denen bereits bestehende oder künftige Produkte, Produktionsverfahren oder Dienstleistungen entsprechen können. Normung erstreckt sich über unterschiedliche Bereiche, beispielsweise die Normung unterschiedlicher Ausführungen oder Größen eines Produkts oder technische Spezifikationen in Produkt- oder Dienstleistungsmärkten, bei denen die Kompatibilität und Interoperabilität mit anderen Produkten oder Systemen unerlässlich sind.
>
> *(2)* Die europäische Normung wird durch und für die einschlägigen Interessenträger organisiert, und zwar auf der Grundlage nationaler Vertretung (Europäisches Komitee für Normung (CEN) und das Europäisches Komitee für Elektrotechnische Normung (Cenelec)) und direkter Beteiligung (Europäisches Institut für Telekommunikationsnormen (ETSI)), und sie stützt sich auf die von der Welthandelsorganisation (WTO) anerkannten Grundsätze auf dem Gebiet der Normung, nämlich Kohärenz, Transparenz, Offenheit, Konsens, Freiwilligkeit der Anwendung, Unabhängigkeit von Einzelinteressen und Effizienz (im Folgenden „Grundprinzipien“). Nach den Grundprinzipien ist es wichtig, dass alle interessierten Kreise, einschließlich der Behörden und der kleineren und mittleren Unternehmen (KMU), angemessen in den nationalen und europäischen Normungsprozess einbezogen werden. Die nationalen Normungsorganisationen sollten außerdem die Mitwirkung von Interessenträgern fördern und erleichtern.
>
> *(3)* Die europäische Normung trägt ferner dazu bei, die Wettbewerbsfähigkeit der Unternehmen zu verbessern, indem sie insbesondere den freien Verkehr von Waren und Dienstleistungen, die Interoperabilität von Netzwerken, Kommunikationsmittel sowie die technologische Entwicklung und die Innovation vereinfacht. Durch die europäische Normung wird die weltweite Wettbewerbsfähigkeit der europäischen Industrie besonders dann gestärkt, wenn sie in Koordination mit den internationalen Normungsorganisationen, d. h. der Internationalen Organisation für Normung (ISO), der Internationalen Elektrotechnischen Kommission (IEC) und der Internationalen Fernmeldeunion (ITU), erfolgt. Normen haben eindeutig positive Auswirkungen auf die Wirtschaft, indem sie unter anderem die wirtschaftliche Durchdringung im Binnenmarkt fördern und zur Entwicklung neuer und verbesserter Produkte und Märkte sowie besserer Lieferbedingungen beitragen. Normen führen daher in der Regel zu einem stärkeren Wettbewerb und niedrigeren Output- und Verkaufskosten, was den Volkswirtschaften insgesamt und besonders den Verbrauchern zugute kommt. Normen leisten einen Beitrag zur Aufrechterhaltung und Verbesserung von Qualität, sind ein… [gekürzt — 1.200 von 1.343 Zeichen]
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

> Das KI-Gremium berät und unterstützt die Kommission und die Mitgliedstaaten, um die einheitliche und wirksame Anwendung dieser Verordnung zu erleichtern. Für diese Zwecke kann das KI-Gremium insbesondere a) zur Koordinierung zwischen den für die Anwendung dieser Verordnung zuständigen nationalen Behörden beitragen und in Zusammenarbeit mit den betreffenden Marktüberwachungsbehörden und vorbehaltlich ihrer Zustimmung gemeinsame Tätigkeiten der Marktüberwachungsbehörden gemäß Artikel 74 Absatz 11 unterstützen; b) technisches und regulatorisches Fachwissen und bewährte Verfahren zusammentragen und unter den Mitgliedstaaten verbreiten; c) zur Durchführung dieser Verordnung Beratung anbieten, insbesondere
>
> <details><summary>… gesamten Artikel ausklappen — noch 4.256 von 4.965 Zeichen</summary>
>
> im Hinblick auf die Durchsetzung der Vorschriften zu KI-Modellen mit allgemeinem Verwendungszweck; d) zur Harmonisierung der Verwaltungspraxis in den Mitgliedstaaten beitragen, auch bezüglich der Ausnahme vom Konformitätsbewertungsverfahren gemäß Artikel 46 und der Funktionsweise von KI-Reallaboren und Tests unter Realbedingungen gemäß den Artikeln 57, 59 und 60; e) auf Anfrage der Kommission oder in Eigeninitiative Empfehlungen und schriftliche Stellungnahmen zu einschlägigen Fragen der Durchführung dieser Verordnung und ihrer einheitlichen und wirksamen Anwendung abgeben, einschließlich i) zur Entwicklung und Anwendung von Verhaltenskodizes und Praxisleitfäden gemäß dieser Verordnung sowie der Leitlinien der Kommission; ii) zur Bewertung und Überprüfung dieser Verordnung gemäß Artikel 112, auch in Bezug auf die Meldung schwerwiegender Vorfälle gemäß Artikel 73 und das Funktionieren der EU-Datenbank gemäß Artikel 71, die Ausarbeitung der delegierten Rechtsakte oder Durchführungsrechtsakte sowie im Hinblick auf mögliche Anpassungen dieser Verordnung an die in Anhang I aufgeführten Harmonisierungsrechtsvorschriften der Union; iii) zu technischen Spezifikationen oder geltenden Normen in Bezug auf die in Kapitel III Abschnitt 2 festgelegten Anforderungen; iv) zur Anwendung der in den Artikeln 40 und 41 genannten harmonisierten Normen oder gemeinsamen Spezifikationen; v) zu Tendenzen, etwa im Bereich der globalen Wettbewerbsfähigkeit Europas auf dem Gebiet der KI, bei der Verbreitung von KI in der Union und bei der Entwicklung digitaler Fähigkeiten; vi) zu Tendenzen im Bereich der sich ständig weiterentwickelnden Typologie der KI-Wertschöpfungsketten insbesondere hinsichtlich der sich daraus ergebenden Auswirkungen auf die Rechenschaftspflicht; vii) zur möglicherweise notwendigen Änderung des Anhangs III im Einklang mit Artikel 7 und zur möglicherweise notwendigen Überarbeitung des Artikels 5 gemäß Artikel 112 unter Berücksichtigung der einschlägigen verfügbaren Erkenntnisse und der neuesten technologischen Entwicklungen; f) die Kommission bei der Förderung der KI-Kompetenz, der Sensibilisierung und Aufklärung der Öffentlichkeit in Bezug auf die Vorteile, Risiken, Schutzmaßnahmen, Rechte und Pflichten im Zusammenhang mit der Nutzung von KI-Systemen unterstützen; g) die Entwicklung gemeinsamer Kriterien und eines gemeinsamen Verständnisses der Marktteilnehmer und der zuständigen Behörden in Bezug auf die in dieser Verordnung vorgesehenen einschlägigen Konzepte erleichtern, auch durch einen Beitrag zur Entwicklung von Benchmarks; h) gegebenenfalls mit anderen Organen, Einrichtungen und sonstigen Stellen der EU, einschlägigen Sachverständigengruppen und Netzwerken der EU insbesondere in den Bereichen Produktsicherheit, Cybersicherheit, Wettbewerb, digitale und Mediendienste, Finanzdienstleistungen, Verbraucherschutz, Datenschutz und Schutz der Grundrechte zusammenarbeiten; i) zur wirksamen Zusammenarbeit mit den zuständigen Behörden von Drittstaaten und mit internationalen Organisationen beitragen; j) die zuständigen nationalen Behörden und die Kommission beim Aufbau des für die Durchführung dieser Verordnung erforderlichen organisatorischen und technischen Fachwissens beraten, unter anderem durch einen Beitrag zur Einschätzung des Schulungsbedarfs des Personals der Mitgliedstaaten, das an der Durchführung dieser Verordnung beteiligt ist; k) dem Büro für Künstliche Intelligenz helfen, die zuständigen nationalen Behörden bei der Einrichtung und Entwicklung von KI-Reallaboren zu unterstützen, und die Zusammenarbeit und den Informationsaustausch zwischen KI-Reallaboren erleichtern; l) zur Entwicklung von Leitfäden beitragen und diesbezüglich entsprechend beraten; m) die Kommission zu internationalen Angelegenheiten im Bereich der KI beraten; n) der Kommission Stellungnahmen zu qualifizierten Warnungen in Bezug auf KI-Modelle mit allgemeinem Verwendungszweck vorlegen; o) Stellungnahmen der Mitgliedstaaten zu qualifizierten Warnungen in Bezug auf KI-Modelle mit allgemeinem Verwendungszweck entgegennehmen sowie zu nationalen Erfahrungen und Praktiken bei der Überwachung und Durchsetzung von KI-Systemen, insbesondere von Systemen, die KI-Modelle mit allgemeinem Verwendungszweck integrieren.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur… [gekürzt — 1.200 von 1.972 Zeichen]
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

> (1) Produkte mit digitalen Elementen, die die Kernfunktionen einer in Anhang III aufgeführten Produktkategorie aufweisen, gelten als wichtige Produkte mit digitalen Elementen und unterliegen den in Artikel 32 Absätze 2 und 3 genannten Konformitätsbewertungsverfahren. Die Integration eines Produkts mit digitalen Elementen, das die Kernfunktionen einer in Anhang III aufgeführten Produktkategorie aufweist, führt für sich genommen nicht dazu, dass das Produkt, in das es integriert ist, den Konformitätsbewertungsverfahren gemäß Artikel 32 Absätze 2 und 3 unterliegt. (2) Die in Absatz 1 dieses Artikels genannten Kategorien von Produkten mit digitalen Elementen, die gemäß Anhang III in die Klassen I
>
> <details><summary>… gesamten Artikel ausklappen — noch 2.595 von 3.296 Zeichen</summary>
>
> und II unterteilt sind, erfüllen mindestens eines der folgenden Kriterien: a) Das Produkt mit digitalen Elementen erfüllt in erster Linie Funktionen, die für die Cybersicherheit anderer Produkte, Netze oder Dienste von entscheidender Bedeutung sind, einschließlich der Sicherung der Authentifizierung und des Zugangs, der Prävention und Erkennung von Eindringen, der Endpunktsicherheit oder des Netzschutzes; b) das Produkt mit digitalen Elementen erfüllt eine Funktion, die ein erhebliches Risiko nachteiliger Auswirkungen birgt in Bezug auf deren Intensität und Fähigkeit, eine große Zahl anderer Produkte oder die Gesundheit, Sicherheit oder Sicherheit seiner Nutzer durch direkte Manipulation zu stören, zu steuern oder zu schädigen, wie z. B. eine zentrale Systemfunktion, einschließlich Netzmanagement, Konfigurationskontrolle, Virtualisierung oder Verarbeitung personenbezogener Daten. (3) Der Kommission wird die Befugnis übertragen, gemäß Artikel 61 delegierte Rechtsakte zur Änderung des Anhangs III zu erlassen, um innerhalb jeder Klasse der Kategorien von Produkten mit digitalen Elementen eine neue Kategorie in die Liste aufzunehmen und ihre Definition zu präzisieren, eine Produktkategorie von einer Klasse in die andere zu verschieben oder eine bestehende Kategorie von dieser Liste zu streichen. Bei der Bewertung der Notwendigkeit einer Änderung der Liste in Anhang III berücksichtigt die Kommission die cybersicherheitsbezogenen Funktionen oder die Funktion und die Höhe des von Produkten mit digitalen Elementen ausgehenden Cybersicherheitsrisikos gemäß den in Absatz 2 genannten Kriterien des vorliegenden Artikels. Die in Unterabsatz 1 genannten delegierten Rechtsakte sehen gegebenenfalls einen Übergangszeitraum von mindestens 12 Monaten vor, insbesondere wenn eine neue Kategorie wichtiger Produkte mit digitalen Elementen der Klasse I oder II gemäß Anhang III hinzugefügt oder von der Klasse I in die Klasse II verschoben wird, bevor die einschlägigen Konformitätsbewertungsverfahren gemäß Artikel 32 Absätze 2 und 3 zur Anwendung kommen, es sei denn, ein kürzerer Übergangszeitraum ist aus Gründen äußerster Dringlichkeit gerechtfertigt. (4) Bis zum 11. Dezember 2025 erlässt die Kommission einen Durchführungsrechtsakt, in dem sie die technische Beschreibung der nach Anhang III zu den Klassen I und II gehörigen Kategorien von Produkten mit digitalen Elementen und die technische Beschreibung der Kategorien von Produkten mit digitalen Elementen gemäß Anhang IV festlegt. Dieser Durchführungsrechtsakt wird nach dem Prüfverfahren gemäß Artikel 62 Absatz 2 erlassen.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da… [gekürzt — 1.200 von 1.311 Zeichen]
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

> (1) Unbeschadet der Absätze 2 oder 3 treffen Anbieter von Datenverarbeitungsdiensten alle angemessenen technischen, organisatorischen und rechtlichen Maßnahmen, einschließlich Verträgen, um den staatlichen Zugang zu und die staatliche Übermittlung von in der Union gespeicherten nicht-personenbezogenen Daten im internationalen Umfeld und durch Drittländer zu verhindern, wenn dies im Widerspruch zum Unionsrecht oder zum nationalen Recht des betreffenden Mitgliedstaats stehen würde. (2) Für jegliche Entscheidung bzw. jegliches Urteil eines Gerichts eines Drittlands und jegliche Entscheidung einer Verwaltungsbehörde eines Drittlands, die Anbieter von Datenverarbeitungsdiensten auffordern, in den
>
> <details><summary>… gesamten Artikel ausklappen — noch 4.416 von 5.116 Zeichen</summary>
>
> Anwendungsbereich dieser Verordnung fallende nicht-personenbezogene Daten zu übermitteln oder Zugang zu diesen Daten zu gewähren, gilt, dass sie unabhängig von der Art und Weise nur anerkannt werden bzw. vollstreckbar sind, wenn sie auf einer rechtskräftigen internationalen Übereinkunft, etwa auf einem Rechtshilfeabkommen zwischen dem anfragenden Drittland und der Union oder einer solcher Übereinkunft zwischen dem anfragenden Drittland und einem Mitgliedstaat, beruhen. (3) Wenn keine internationale Übereinkunft gemäß Absatz 2 besteht und an einen Anbieter von Datenverarbeitungsdiensten eine Entscheidung bzw. ein Urteil eines Gerichts eines Drittlands oder eine Entscheidung einer Verwaltungsbehörde eines Drittlands ergeht, wonach unter diese Verordnung fallende in der Union gespeicherte nicht-personenbezogene Daten zu übermitteln sind oder Zugang zu diesen Daten zu gewähren ist, und der Adressat eines solchen Urteils oder einer solchen Entscheidung im Falle der Folgeleistung gegen das Unionsrecht oder das nationale Recht des betreffenden Mitgliedstaats verstoßen würde, erfolgt die Übermittlung von oder die Gewährung des Zugangs zu diesen Daten an bzw. für die betreffende Drittlandsbehörde nur, wenn a) das Rechtssystem des Drittlands vorschreibt, dass die Entscheidung oder das Urteil zu begründen ist und verhältnismäßig sein muss, und vorsieht, dass die Entscheidung oder das Urteil eine hinreichende Bestimmtheit aufweisen muss, indem darin z. B. eine hinreichende Bezugnahme auf bestimmte verdächtige Personen oder Rechtsverletzungen erfolgt, b) der begründete Einwand des Adressaten von einem zuständigen Gericht des Drittlands überprüft wird und c) das zuständige Gericht des Drittlands, das die Entscheidung oder das Urteil erlässt oder die Entscheidung einer Verwaltungsbehörde überprüft, nach dem Recht dieses Drittlands befugt ist, die einschlägigen rechtlichen Interessen des Bereitstellers der durch das Unionsrecht oder das nationale Recht des betreffenden Mitgliedstaats geschützten Daten gebührend zu berücksichtigen. Der Adressat der Entscheidung oder des Urteils kann die Stellungnahme der zuständigen nationalen Stelle oder der für die internationale Zusammenarbeit in Rechtssachen zuständigen Behörde einholen, um festzustellen, ob die in Unterabsatz 1 festgelegten Bedingungen erfüllt sind, insbesondere wenn er der Auffassung ist, dass die Entscheidung möglicherweise Geschäftsgeheimnisse und andere sensible Geschäftsdaten sowie Inhalte, die durch Rechte des geistigen Eigentums geschützt sind, betrifft oder die Übermittlung eine Re-Identifikation ermöglichen könnte. Die zuständige nationale Stelle oder Behörde kann die Kommission konsultieren. Ist der Adressat der Auffassung, dass die Entscheidung oder das Urteil die nationale Sicherheit oder die Verteidigungsinteressen der Union oder ihrer Mitgliedstaaten beeinträchtigen könnte, so holt er die Stellungnahme der einschlägigen nationalen Stellen oder Behörden ein, um festzustellen, ob die verlangten Daten die nationale Sicherheit oder die Verteidigungsinteressen der Union oder ihrer Mitgliedstaaten betreffen. Hat der Adressat binnen eines Monats keine Antwort erhalten oder gelangt eine solche Stelle oder Behörde in ihrer Stellungnahme zu dem Schluss, dass die in Unterabsatz 1 festgelegten Bedingungen nicht erfüllt sind, so kann der Adressat die Aufforderung zur Übermittlung von oder zum Zugang zu nicht-personenbezogenen Daten aus diesen Gründen ablehnen. Der in Artikel 42 genannte EDIB berät und unterstützt die Kommission bei der Ausarbeitung von Leitlinien für die Bewertung, ob die in Unterabsatz 1 dieses Absatzes genannten Bedingungen erfüllt sind. (4) Sind die Voraussetzungen nach Absatz 2 oder Absatz 3 erfüllt, so stellt der Anbieter von Datenverarbeitungsdiensten die Mindestmenge an Daten bereit, die auf der Grundlage einer angemessenen Auslegung dieses Verlangens durch den Anbieter oder die in Absatz 3 Unterabsatz 2 genannte einschlägige nationale Stelle oder Behörde als Reaktion auf das Verlangen zulässig ist. (5) Der Anbieter von Datenverarbeitungsdiensten teilt dem Kunden mit, dass für seine Daten ein Datenzugangsverlangen einer Behörde eines Drittlands vorliegt, bevor er das Verlangen erfüllt, außer in Fällen, in denen das Verlangen Strafverfolgungszwecken dient und solange zur Wahrung der Wirksamkeit der Strafverfolgungsmaßnahmen erforderlich ist. KAPITEL VIII INTEROPERABILITÄT
>
> </details>

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

> 1. The Joint Committee, in accordance with Article 57(1) of Regulations (EU) No 1093/2010, (EU) No 1094/2010 and (EU) No 1095/2010, shall establish the Oversight Forum as a sub-committee for the purposes of supporting the work of the Joint Committee and of the Lead Overseer referred to in Article 31(1), point (b), in the area of ICT third-party risk across financial sectors. The Oversight Forum shall prepare the draft joint positions and the draft common acts of the Joint Committee in that area. The Oversight Forum shall regularly discuss relevant developments on ICT risk and vulnerabilities and promote a consistent approach in the monitoring of ICT third-party risk at Union level. 2. The Oversight
>
> <details><summary>… gesamten Artikel ausklappen — noch 3.709 von 4.416 Zeichen</summary>
>
> Forum shall, on a yearly basis, undertake a collective assessment of the results and findings of the oversight activities conducted for all critical ICT third-party service providers and promote coordination measures to increase the digital operational resilience of financial entities, foster best practices on addressing ICT concentration risk and explore mitigants for cross-sector risk transfers. 3. The Oversight Forum shall submit comprehensive benchmarks for critical ICT third-party service providers to be adopted by the Joint Committee as joint positions of the ESAs in accordance with Article 56(1) of Regulations (EU) No 1093/2010, (EU) No 1094/2010 and (EU) No 1095/2010. 4. The Oversight Forum shall be composed of: (a) the Chairpersons of the ESAs; (b) one high-level representative from the current staff of the relevant competent authority referred to in Article 46 from each Member State; (c) the Executive Directors of each ESA and one representative from the Commission, from the ESRB, from ECB and from ENISA as observers; (d) where appropriate, one additional representative of a competent authority referred to in Article 46 from each Member State as observer; (e) where applicable, one representative of the competent authorities designated or established in accordance with Directive (EU) 2022/2555 responsible for the supervision of an essential or important entity subject to that Directive, which has been designated as a critical ICT third-party service provider, as observer. The Oversight Forum may, where appropriate, seek the advice of independent experts appointed in accordance with paragraph 6. 5. Each Member State shall designate the relevant competent authority whose staff member shall be the high-level representative referred in paragraph 4, first subparagraph, point (b), and shall inform the Lead Overseer thereof. The ESAs shall publish on their website the list of high-level representatives from the current staff of the relevant competent authority designated by Member States. 6. The independent experts referred to in paragraph 4, second subparagraph, shall be appointed by the Oversight Forum from a pool of experts selected following a public and transparent application process. The independent experts shall be appointed on the basis of their expertise in financial stability, digital operational resilience and ICT security matters. They shall act independently and objectively in the sole interest of the Union as a whole and shall neither seek nor take instructions from Union institutions or bodies, from any government of a Member State or from any other public or private body. 7. In accordance with Article 16 of Regulations (EU) No 1093/2010, (EU) No 1094/2010 and (EU) No 1095/2010, the ESAs shall by 17 July 2024 issue, for the purposes of this Section, guidelines on the cooperation between the ESAs and the competent authorities covering the detailed procedures and conditions for the allocation and execution of tasks between competent authorities and the ESAs and the details on the exchanges of information which are necessary for competent authorities to ensure the follow-up of recommendations pursuant to Article 35(1), point (d), addressed to critical ICT third-party service providers. 8. The requirements set out in this Section shall be without prejudice to the application of Directive (EU) 2022/2555 and of other Union rules on oversight applicable to providers of cloud computing services. 9. The ESAs, through the Joint Committee and based on preparatory work conducted by the Oversight Forum, shall, on yearly basis, submit a report on the application of this Section to the European Parliament, the Council and the Commission.
>
> </details>

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

> (1) Die Mitgliedstaaten, die Aufsichtsbehörden, der Ausschuss und die Kommission fördern die Ausarbeitung von Verhaltensregeln, die nach Maßgabe der Besonderheiten der einzelnen Verarbeitungsbereiche und der besonderen Bedürfnisse von Kleinstunternehmen sowie kleinen und mittleren Unternehmen zur ordnungsgemäßen Anwendung dieser Verordnung beitragen sollen. (2) Verbände und andere Vereinigungen, die Kategorien von Verantwortlichen oder Auftragsverarbeitern vertreten, können Verhaltensregeln ausarbeiten oder ändern oder erweitern, mit denen die Anwendung dieser Verordnung beispielsweise zu dem Folgenden präzisiert wird: a) faire und transparente Verarbeitung; b) die berechtigten Interessen des
>
> <details><summary>… gesamten Artikel ausklappen — noch 5.052 von 5.753 Zeichen</summary>
>
> Verantwortlichen in bestimmten Zusammenhängen; c) Erhebung personenbezogener Daten; d) Pseudonymisierung personenbezogener Daten; e) Unterrichtung der Öffentlichkeit und der betroffenen Personen; f) Ausübung der Rechte betroffener Personen; g) Unterrichtung und Schutz von Kindern und Art und Weise, in der die Einwilligung des Trägers der elterlichen Verantwortung für das Kind einzuholen ist; h) die Maßnahmen und Verfahren gemäß den Artikeln 24 und 25 und die Maßnahmen für die Sicherheit der Verarbeitung gemäß Artikel 32; i) die Meldung von Verletzungen des Schutzes personenbezogener Daten an Aufsichtsbehörden und die Benachrichtigung der betroffenen Person von solchen Verletzungen des Schutzes personenbezogener Daten; j) die Übermittlung personenbezogener Daten an Drittländer oder an internationale Organisationen oder k) außergerichtliche Verfahren und sonstige Streitbeilegungsverfahren zur Beilegung von Streitigkeiten zwischen Verantwortlichen und betroffenen Personen im Zusammenhang mit der Verarbeitung, unbeschadet der Rechte betroffener Personen gemäß den Artikeln 77 und 79. (3) Zusätzlich zur Einhaltung durch die unter diese Verordnung fallenden Verantwortlichen oder Auftragsverarbeiter können Verhaltensregeln, die gemäß Absatz 5 des vorliegenden Artikels genehmigt wurden und gemäß Absatz 9 des vorliegenden Artikels allgemeine Gültigkeit besitzen, können auch von Verantwortlichen oder Auftragsverarbeitern, die gemäß Artikel 3 nicht unter diese Verordnung fallen, eingehalten werden, um geeignete Garantien im Rahmen der Übermittlung personenbezogener Daten an Drittländer oder internationale Organisationen nach Maßgabe des Artikels 46 Absatz 2 Buchstabe e zu bieten. Diese Verantwortlichen oder Auftragsverarbeiter gehen mittels vertraglicher oder sonstiger rechtlich bindender Instrumente die verbindliche und durchsetzbare Verpflichtung ein, die geeigneten Garantien anzuwenden, auch im Hinblick auf die Rechte der betroffenen Personen. (4) Die Verhaltensregeln gemäß Absatz 2 des vorliegenden Artikels müssen Verfahren vorsehen, die es der in Artikel 41 Absatz 1 genannten Stelle ermöglichen, die obligatorische Überwachung der Einhaltung ihrer Bestimmungen durch die Verantwortlichen oder die Auftragsverarbeiter, die sich zur Anwendung der Verhaltensregeln verpflichten, vorzunehmen, unbeschadet der Aufgaben und Befugnisse der Aufsichtsbehörde, die nach Artikel 55 oder 56 zuständig ist. (5) Verbände und andere Vereinigungen gemäß Absatz 2 des vorliegenden Artikels, die beabsichtigen, Verhaltensregeln auszuarbeiten oder bestehende Verhaltensregeln zu ändern oder zu erweitern, legen den Entwurf der Verhaltensregeln bzw. den Entwurf zu deren Änderung oder Erweiterung der Aufsichtsbehörde vor, die nach Artikel 55 zuständig ist. Die Aufsichtsbehörde gibt eine Stellungnahme darüber ab, ob der Entwurf der Verhaltensregeln bzw. der Entwurf zu deren Änderung oder Erweiterung mit dieser Verordnung vereinbar ist und genehmigt diesen Entwurf der Verhaltensregeln bzw. den Entwurf zu deren Änderung oder Erweiterung, wenn sie der Auffassung ist, dass er ausreichende geeignete Garantien bietet. (6) Wird durch die Stellungnahme nach Absatz 5 der Entwurf der Verhaltensregeln bzw. der Entwurf zu deren Änderung oder Erweiterung genehmigt und beziehen sich die betreffenden Verhaltensregeln nicht auf Verarbeitungstätigkeiten in mehreren Mitgliedstaaten, so nimmt die Aufsichtsbehörde die Verhaltensregeln in ein Verzeichnis auf und veröffentlicht sie. (7) Bezieht sich der Entwurf der Verhaltensregeln auf Verarbeitungstätigkeiten in mehreren Mitgliedstaaten, so legt die nach Artikel 55 zuständige Aufsichtsbehörde — bevor sie den Entwurf der Verhaltensregeln bzw. den Entwurf zu deren Änderung oder Erweiterung genehmigt — ihn nach dem Verfahren gemäß Artikel 63 dem Ausschuss vor, der zu der Frage Stellung nimmt, ob der Entwurf der Verhaltensregeln bzw. der Entwurf zu deren Änderung oder Erweiterung mit dieser Verordnung vereinbar ist oder — im Fall nach Absatz 3 dieses Artikels — geeignete Garantien vorsieht. (8) Wird durch die Stellungnahme nach Absatz 7 bestätigt, dass der Entwurf der Verhaltensregeln bzw. der Entwurf zu deren Änderung oder Erweiterung mit dieser Verordnung vereinbar ist oder — im Fall nach Absatz 3 — geeignete Garantien vorsieht, so übermittelt der Ausschuss seine Stellungnahme der Kommission. (9) Die Kommission kann im Wege von Durchführungsrechtsakten beschließen, dass die ihr gemäß Absatz 8 übermittelten genehmigten Verhaltensregeln bzw. deren genehmigte Änderung oder Erweiterung allgemeine Gültigkeit in der Union besitzen. Diese Durchführungsrechtsakte werden gemäß dem Prüfverfahren nach Artikel 93 Absatz 2 erlassen. (10) Die Kommission trägt dafür Sorge, dass die genehmigten Verhaltensregeln, denen gemäß Absatz 9 allgemeine Gültigkeit zuerkannt wurde, in geeigneter Weise veröffentlicht werden. (11) Der Ausschuss nimmt alle genehmigten Verhaltensregeln bzw. deren genehmigte Änderungen oder Erweiterungen in ein Register auf und veröffentlicht sie in geeigneter Weise.
>
> </details>

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

> Die Verordnung (EU) 2018/1139 wird wie folgt geändert: 1. In Artikel 17 wird folgender Absatz angefügt:<br>„(3) Unbeschadet des Absatzes 2 werden beim Erlass von Durchführungsrechtsakten nach Absatz 1, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 des Europäischen Parlaments und des Rates [(\*)](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32024R1689#ntr*-L_202401689DE.000101-E0064) handelt, die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.<br>[(\*)](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32024R1689#ntc*-L_202401689DE.000101-E0064)
>
> <details><summary>… gesamten Artikel ausklappen — noch 2.347 von 3.060 Zeichen</summary>
>
> Verordnung (EU) 2024/1689 des Europäischen Parlaments und des Rates vom 13. Juni 2024 zur Festlegung harmonisierter Vorschriften für künstliche Intelligenz und zur Änderung der Verordnungen (EG) Nr. 300/2008, (EU) Nr. 167/2013, (EU) Nr. 168/2013, (EU) 2018/858, (EU) 2018/1139 und (EU) 2019/2144 sowie der Richtlinien 2014/90/EU, (EU) 2016/797 und (EU) 2020/1828 (Verordnung über künstliche Intelligenz) ( [ABl. L, 2024/1689, 12.7.2024, ELI: http://data.europa.eu/eli/reg/2024/1689/oj](https://data.europa.eu/eli/reg/2024/1689/oj)).“<br>" 2. In Artikel 19 wird folgender Absatz angefügt:<br>„(4) Beim Erlass delegierter Rechtsakte nach den Absätzen 1 und 2, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 handelt, werden die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.“ 3. In Artikel 43 wird folgender Absatz angefügt:<br>„(4) Beim Erlass von Durchführungsrechtsakten nach Absatz 1, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 handelt, werden die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.“ 4. In Artikel 47 wird folgender Absatz angefügt:<br>„(3) Beim Erlass delegierter Rechtsakte nach den Absätzen 1 und 2, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 handelt, werden die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.“ 5. In Artikel 57 wird folgender Unterabsatz angefügt:<br>„Beim Erlass solcher Durchführungsrechtsakte, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 handelt, werden die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.“ 6. In Artikel 58 wird folgender Absatz angefügt:<br>„(3) Beim Erlass delegierter Rechtsakte nach den Absätzen 1 und 2, die sich auf Systeme der künstlichen Intelligenz beziehen, bei denen es sich um Sicherheitsbauteile im Sinne der Verordnung (EU) 2024/1689 handelt, werden die in Kapitel III Abschnitt 2 jener Verordnung festgelegten Anforderungen berücksichtigt.“
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Zweck dieser Verordnung ist es, das Funktionieren des Binnenmarkts zu verbessern, indem ein einheitlicher Rechtsrahmen insbesondere für die Entwicklung, das Inverkehrbringen, die Inbetriebnahme und die Verwendung von Systemen künstlicher Intelligenz (KI-Systeme) in der Union im Einklang mit den Werten der Union festgelegt wird, um die Einführung von menschenzentrierter und vertrauenswürdiger künstlicher Intelligenz (KI) zu fördern und gleichzeitig ein hohes Schutzniveau in Bezug auf Gesundheit, Sicherheit und der in der Charta der Grundrechte der Europäischen Union („Charta“) verankerten Grundrechte, einschließlich Demokratie, Rechtsstaatlichkeit und Umweltschutz, sicherzustellen, den Schutz vor schädlichen Auswirkungen von KI-Systemen in der Union zu gewährleisten und gleichzeitig die Innovation zu unterstützen. Diese Verordnung gewährleistet den grenzüberschreitenden freien Verkehr KI-gestützter Waren und Dienstleistungen, wodurch verhindert wird, dass die Mitgliedstaaten die Entwicklung, Vermarktung und Verwendung von KI-Systemen beschränken, sofern dies nicht ausdrücklich durch diese Verordnung erlaubt wird.
>
> *(2)* Diese Verordnung sollte im Einklang mit den in der Charta verankerten Werten der Union angewandt werden, den Schutz von natürlichen Personen, Unternehmen, Demokratie und Rechtsstaatlichkeit sowie der Umwelt erleichtern und gleichzeitig Innovation und Beschäftigung fördern und der Union eine Führungsrolle bei der Einführung vertrauenswürdiger KI verschaffen.
>
> *(3)* KI-Systeme können problemlos in verschiedenen Bereichen der Wirtschaft und Gesellschaft, auch grenzüberschreitend, eingesetzt werden und in der gesamten Union verkehren. Einige Mitgliedstaaten haben bereits die Verabschiedung nationaler Vorschriften in Erwägung gezogen, damit KI vertrauenswürdig und sicher ist und im Einklang mit den Grundrechten entwickelt und verwendet wird. Unterschiedliche nationale Vorschriften können zu einer Fragmentierung des Binnenmarkts führen und können die Rechtssicherheit für Akteure, die KI-Systeme entwickeln, einführen oder verwenden, beeinträchtigen. Daher sollte in der gesamten Union ein einheitlich hohes Schutzniveau sichergestellt werden, um eine vertrauenswürdige KI zu erreichen, wobei Unterschiede, die den freien Verkehr, Innovationen, den Einsatz und die Verbreitung von KI-Systemen und damit zusammenhängenden Produkten und Dienstleistungen im Binnenmarkt behindern, vermieden werden sollten, indem den Akteuren einheitliche Pflichten auferlegt werden und der gleiche Schutz der zwingenden Gründe des Allgemeininteresses und der Rechte von Personen im gesamten Binnenmarkt auf der Grundlage des Artikels 114 des Vertrags über die Arbeitsweise der Eur… [gekürzt — 1.200 von 1.972 Zeichen]
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

> (1) EU-Baumusterprüfbescheinigungen und Zulassungen, die in Bezug auf Cybersicherheitsanforderungen für Produkte mit digitalen Elementen erteilt wurden, die anderen Harmonisierungsrechtsvorschriften der Union als der vorliegenden Verordnung unterliegen, bleiben bis zum 11. Juni 2028 gültig, sofern sie nicht vor diesem Zeitpunkt ablaufen oder sofern in anderen Harmonisierungsrechtsvorschriften der Union nichts anderes festgelegt ist; in letzterem Fall bleiben sie gemäß den letztgenannten Rechtsvorschriften gültig. (2) Produkte mit digitalen Elementen, die vor dem 11. Dezember 2027 in den Verkehr gebracht wurden, unterliegen den in dieser Verordnung festgelegten Anforderungen nur dann, wenn nach
>
> <details><summary>… gesamten Artikel ausklappen — noch 334 von 1.036 Zeichen</summary>
>
> diesem Zeitpunkt diese Produkte einer wesentlichen Änderung unterliegen. (3) Abweichend von Absatz 2 des vorliegenden Artikels gelten die in Artikel 14 festgelegten Pflichten für alle Produkte mit digitalen Elementen, die in den Anwendungsbereich dieser Verordnung fallen und vor dem 11. Dezember 2027 in den Verkehr gebracht wurden.
>
> </details>

**Wozu es dieses Gesetz gibt** *(Erwägungsgründe (1), (2), (3) — Zweck des Gesetzes, nicht speziell dieses Artikels; kein Normtext)*

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da… [gekürzt — 1.200 von 1.311 Zeichen]
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

> 1. This Regulation lays down harmonised rules, inter alia, on: (a) the making available of product data and related service data to the user of the connected product or related service; (b) the making available of data by data holders to data recipients; (c) the making available of data by data holders to public sector bodies, the Commission, the European Central Bank and Union bodies, where there is an exceptional need for those data for the performance of a specific task carried out in the public interest; (d) facilitating switching between data processing services; (e) introducing safeguards against unlawful third-party access to non-personal data; and (f) the development of interoperability
>
> <details><summary>… gesamten Artikel ausklappen — noch 5.524 von 6.227 Zeichen</summary>
>
> standards for data to be accessed, transferred and used. 2. This Regulation covers personal and non-personal data, including the following types of data, in the following contexts: (a) Chapter II applies to data, with the exception of content, concerning the performance, use and environment of connected products and related services; (b) Chapter III applies to any private sector data that is subject to statutory data sharing obligations; (c) Chapter IV applies to any private sector data accessed and used on the basis of contract between enterprises; (d) Chapter V applies to any private sector data with a focus on non-personal data; (e) Chapter VI applies to any data and services processed by providers of data processing services; (f) Chapter VII applies to any non-personal data held in the Union by providers of data processing services. 3. This Regulation applies to: (a) manufacturers of connected products placed on the market in the Union and providers of related services, irrespective of the place of establishment of those manufacturers and providers; (b) users in the Union of connected products or related services as referred to in point (a); (c) data holders, irrespective of their place of establishment, that make data available to data recipients in the Union; (d) data recipients in the Union to whom data are made available; (e) public sector bodies, the Commission, the European Central Bank and Union bodies that request data holders to make data available where there is an exceptional need for those data for the performance of a specific task carried out in the public interest and to the data holders that provide those data in response to such request; (f) providers of data processing services, irrespective of their place of establishment, providing such services to customers in the Union; (g) participants in data spaces and vendors of applications using smart contracts and persons whose trade, business or profession involves the deployment of smart contracts for others in the context of executing an agreement. 4. Where this Regulation refers to connected products or related services, such references are also understood to include virtual assistants insofar as they interact with a connected product or related service. 5. This Regulation is without prejudice to Union and national law on the protection of personal data, privacy and confidentiality of communications and integrity of terminal equipment, which shall apply to personal data processed in connection with the rights and obligations laid down herein, in particular Regulations (EU) 2016/679 and (EU) 2018/1725 and Directive 2002/58/EC, including the powers and competences of supervisory authorities and the rights of data subjects. Insofar as users are data subjects, the rights laid down in Chapter II of this Regulation shall complement the rights of access by data subjects and rights to data portability under Articles 15 and 20 of Regulation (EU) 2016/679. In the event of a conflict between this Regulation and Union law on the protection of personal data or privacy, or national legislation adopted in accordance with such Union law, the relevant Union or national law on the protection of personal data or privacy shall prevail. 6. This Regulation does not apply to or pre-empt voluntary arrangements for the exchange of data between private and public entities, in particular voluntary arrangements for data sharing. This Regulation does not affect Union or national legal acts providing for the sharing of, access to and the use of data for the purpose of the prevention, investigation, detection or prosecution of criminal offences or for the execution of criminal penalties, or for customs and taxation purposes, in particular Regulations (EU) 2021/784, (EU) 2022/2065 and (EU) 2023/1543 and Directive (EU) 2023/1544, or international cooperation in that area. This Regulation does not apply to the collection or sharing of, access to or the use of data under Regulation (EU) 2015/847 and Directive (EU) 2015/849. This Regulation does not apply to areas that fall outside the scope of Union law and in any event does not affect the competences of the Member States concerning public security, defence or national security, regardless of the type of entity entrusted by the Member States to carry out tasks in relation to those competences, or their power to safeguard other essential State functions, including ensuring the territorial integrity of the State and the maintenance of law and order. This Regulation does not affect the competences of the Member States concerning customs and tax administration or the health and safety of citizens. 7. This Regulation complements the self-regulatory approach of Regulation (EU) 2018/1807 by adding generally applicable obligations on cloud switching. 8. This Regulation is without prejudice to Union and national legal acts providing for the protection of intellectual property rights, in particular Directives 2001/29/EC, 2004/48/EC and (EU) 2019/790. 9. This Regulation complements and is without prejudice to Union law which aims to promote the interests of consumers and ensure a high level of consumer protection, and to protect their health, safety and economic interests, in particular Directives 93/13/EEC, 2005/29/EC and 2011/83/EU. 10. This Regulation does not preclude the conclusion of voluntary lawful data sharing contracts, including contracts concluded on a reciprocal basis, which comply with the requirements laid down in this Regulation.
>
> </details>

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

> 1. In order to achieve a high common level of digital operational resilience, this Regulation lays down uniform requirements concerning the security of network and information systems supporting the business processes of financial entities as follows: (a) requirements applicable to financial entities in relation to: (i) information and communication technology (ICT) risk management; (ii) reporting of major ICT-related incidents and notifying, on a voluntary basis, significant cyber threats to the competent authorities; (iii) reporting of major operational or security payment-related incidents to the competent authorities by financial entities referred to in Article 2(1), points (a) to (d); (iv)
>
> <details><summary>… gesamten Artikel ausklappen — noch 1.156 von 1.859 Zeichen</summary>
>
> digital operational resilience testing; (v) information and intelligence sharing in relation to cyber threats and vulnerabilities; (vi) measures for the sound management of ICT third-party risk; (b) requirements in relation to the contractual arrangements concluded between ICT third-party service providers and financial entities; (c) rules for the establishment and conduct of the Oversight Framework for critical ICT third-party service providers when providing services to financial entities; (d) rules on cooperation among competent authorities, and rules on supervision and enforcement by competent authorities in relation to all matters covered by this Regulation. 2. In relation to financial entities identified as essential or important entities pursuant to national rules transposing Article 3 of Directive (EU) 2022/2555, this Regulation shall be considered a sector-specific Union legal act for the purposes of Article 4 of that Directive. 3. This Regulation is without prejudice to the responsibility of Member States’ regarding essential State functions concerning public security, defence and national security in accordance with Union law.
>
> </details>

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

> *(1)* Die Cybersicherheit bedeutet eine der größten Herausforderungen für die Union. Die Zahl und Vielfalt der vernetzten Geräte wird in den kommenden Jahren exponentiell zunehmen. Cyberangriffe sind ein Thema von öffentlichem Interesse, da sie sich nicht nur auf die Wirtschaft der Union, sondern auch auf die Demokratie sowie die Sicherheit und Gesundheit der Verbraucher kritisch auswirken. Es ist deshalb nötig, das Cybersicherheitskonzept der Union zu stärken, sich mit Cyberresilienz auf Unionsebene zu befassen und das Funktionieren des Binnenmarkts zu verbessern und dazu einen einheitlichen Rechtsrahmen für grundlegende Cybersicherheitsanforderungen für das Inverkehrbringen von Produkten mit digitalen Elementen auf dem Unionsmarkt festzulegen. Dabei sollten zwei große Probleme angegangen werden, die hohe Kosten für die Nutzer und die Gesellschaft verursachen: ein geringes Maß an Cybersicherheit von Produkten mit digitalen Elementen, das sich in weitverbreiteten Schwachstellen und der unzureichenden und inkohärenten Bereitstellung von Sicherheitsaktualisierungen zu deren Behebung zeigt, sowie ein unzureichendes Verständnis und ein mangelnder Informationszugang der Nutzer, wodurch sie da… [gekürzt — 1.200 von 1.311 Zeichen]
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

---

## Textanzeige

Jeder Artikel steht **vollständig** im Bogen — nichts ist still gekürzt. **22** von
36 Fällen sind länger als 700 Zeichen; dort ist der Rest hinter
„… gesamten Artikel ausklappen" gefaltet, die Restlänge steht jeweils dabei.

**14** angezeigte Erwägungsgrund-Auszüge sind auf 1.200 Zeichen
gekürzt und im Text als „[gekürzt — N von M Zeichen]" ausgewiesen. Erwägungsgründe sind Kontext,
nicht Urteilsgegenstand.
