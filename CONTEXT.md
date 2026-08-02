# TheArchitect — Domain Language

The shared vocabulary for TheArchitect. This is a glossary, not a spec: it defines what
terms *mean*, so code, UI copy, ADRs, and conversations use one language. Implementation
details do not belong here.

## The Journey (spatial UI redesign)

The redesign presents the whole tool as **one persistent 3D world** you move through, rather
than a set of separate pages. These terms fix that model.

**Phase**:
One of the six canonical TOGAF ADM stations that form the backbone of a project's journey.
The Phase is the unit of progress; it owns completion logic and the current-Phase pointer. Its
ADM identity is the engine; the surface shows a plain-language name with the ADM reference as a
badge:

| Station (surface) | ADM badge | Job |
|---|---|---|
| **Vision** | Phase A | Scope, stakeholders, principles |
| **Model** | Phases B–D | Business, data, application, technology |
| **Explore** | Phase E | Options, gaps, standards |
| **Plan** | Phase F | Simulation, cost, roadmap |
| **Govern** | Phase G | Policies, approvals |
| **Track** | Phase H | Audit, snapshots, change |

_Avoid_: Act, Step, Stage

**Station**:
The spatial manifestation of a Phase — a camera position in the World plus one primary
call-to-action plus whatever Sheets belong to it. A Phase is *what* you are doing; a Station
is *where* you stand to do it. Navigating to a Station moves the camera; it does not unmount
the World.
_Avoid_: Scene, View, Screen

**On-ramp**:
An entry mechanism that fills the early Phases quickly — e.g. the public landing ("Arrival")
or AI-generation of a first model ("Genesis"). An On-ramp is *not* a Phase and never appears
on the Rail as one; it is how you arrive at or populate the first Stations.
_Avoid_: Act, Onboarding step

**World**:
The single persistent 3D canvas that holds the architecture and never unmounts. Route changes
re-aim the camera within the World rather than replacing it.
_Avoid_: Stage (collides with pipeline stage), Canvas, Scene (that is the React component)

**Rail**:
The visible Phase navigator — the spine that shows where you are, what is done, and lets you
jump between Phases. It shows the path; it is not where tools live.
_Avoid_: Stepper, Tab bar, Sidebar nav

**Sheet**:
A DOM overlay panel that slides in *over* the World to hold dense, non-spatial data (matrices,
tables, property editing) and slides away again. Opening a Sheet never changes route and never
unmounts the World.
_Avoid_: Modal, Drawer, Page

## Requirements (ISO/IEC/IEEE 15288:2023, §6.4.2 / §6.4.3)

The chain from a law to a measure. These terms come from the standard, not from us — so
that a Systems Engineer, an auditor and the code use one language.

**System of Interest**:
The customer's **enterprise as a socio-technical system** — processes, people, methods,
tools, data, facilities. Not "the IT landscape": most legal duties bind the organisation,
not a server, and it is the organisation an auditor assesses.
_Avoid_: The platform, The app, The customer (that is a party, not a system)

**Stakeholder Need**:
What a stakeholder demands, **as they express it**. For a regulator, the Need *is* the legal
text — verbatim, unnormalised, with all its nesting and ambiguity. A Need is never edited by
us; it is quoted and traced to.
_Avoid_: Requirement (a Need has not passed any quality gate), Obligation

**Stakeholder Requirement**:
One demand of one stakeholder, restated so it is **singular, unambiguous, verifiable and
implementation-independent** (ISO/IEC/IEEE 29148). Produced by transforming a Need — this
transformation is where our quality gate hangs, because it is the first artefact we control.
Every Stakeholder Requirement traces back to the Need it came from.
_Avoid_: Pflicht, Obligation, Compliance Requirement (all three blur Need and Requirement)

**Constraint**:
A Stakeholder Requirement that **restricts the solution space** instead of demanding a
capability — the deontic mode is prohibition. Projected to ArchiMate `constraint`, whereas
duties and permissions become `requirement`.
_Avoid_: Limitation, Restriction

**System Requirement**:
What the System of Interest must be able to do, stated **implementation-free** and singular
(§6.4.3.1). Derived from one or more Stakeholder Requirements. A statement carrying two
different deadlines or two different recipients is not one System Requirement but two —
singularity is the test, not a matter of taste.
_Avoid_: Maßnahme, Control, Measure (those realise it, they are not it)

**Measure**:
The **process, method or tool** that realises one or more System Requirements — the PMT
element in the architecture layers, linked by ArchiMate `realization`. This is where the
work happens and where effort is shared across laws.
_Avoid_: Requirement, Control (ambiguous: catalogues call both the demand and its realisation
a "control")

**Harmonisation**:
Two Stakeholder Requirements from different legal acts collapse into **one** System
Requirement **only if** protected interest, obliged party, trigger and evidence are identical
— i.e. the System Requirement can be worded identically. Otherwise they remain two System
Requirements sharing **one** Measure. The shared Measure is the normal case; the collapse is
the exception and is tested, never assumed. Measured 2026-08-01: `equal` occurred in 0 of 120
pairs.
_Avoid_: Merge, Deduplication (both suggest one of the two demands disappears — it does not;
each keeps its own legal basis and its own evidence)

**Displacement**:
One provision **rules another out** for a given class of obliged parties — *lex specialis*.
For a financial entity, DORA Art. 6 displaces NIS2 Art. 21 (DORA Art. 1(2); NIS2 Art. 4 and
recital 28). Displacement is a **fact about the law**, recorded as a typed edge with its
citation; whether it bites for a given customer is **computed**, never stored. Two Stakeholder
Requirements whose applicability never overlaps cannot share a Measure — the question of
harmonisation does not arise.
_Avoid_: Exception, Override, Priority

## Conformance (established in ADR-0003)

**Conformance**:
The activity of checking whether a Subject satisfies a Norm, and surfacing the gaps. The
umbrella for the three gates (internally: COVER · ENFORCE · ATTEST).
_Avoid_: Comply, Compliance check (as a navigation label)

**Subject**:
*What* is being assessed in a Conformance check — the EA **model** (COVER/ENFORCE) or an
**imported artefact** such as a workflow (ATTEST).

**Norm**:
*What* a Subject is assessed against — an external standard, an internal policy, or the
mandatory fields of a law.

**Conformance Hub**:
The plain-language router (a Sheet) that scopes a Conformance check by asking, in everyday
words, "what do you want to check?" — i.e. which Subject against which Norm. There is exactly
one Hub, reachable from any compliance Phase, pre-scoped to the current Phase but able to cross
over. Division of labour: the **Hub** handles entry/scoping, the **World** shows results (where
the gaps are), a **Matrix** Sheet holds the dense detail behind a finding.
_Avoid_: Compliance landing, Assess page
