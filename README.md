# AlgoBlocks

*A block-based Python learning platform with a built-in time and space complexity analyzer*

<!-- TODO: add a screenshot of the editor and the analysis panel -->
<!-- ![AlgoBlocks editor](docs/editor.png) -->

> **Live demo:** TODO – add link, or remove this line
> **Undergraduate thesis**, University of Cabuyao, BS Computer Science (January – October 2026)

AlgoBlocks helps students learn algorithms and complexity analysis. Learners build programs by dragging blocks, see the equivalent Python code, run it, and get **line-by-line feedback** on how the code behaves and what its time and space complexity is.

---

## Table of Contents

- [Why AlgoBlocks](#why-algoblocks)
- [Features](#features)
- [How the Analyzer Works](#how-the-analyzer-works)
- [Results](#results)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Credits](#credits)

---

## Why AlgoBlocks

Complexity analysis (Big-O) is one of the hardest topics for second- and third-year computer science students. Reading a textbook definition does not show you *why* a loop is O(n) or why a nested loop is O(n²). AlgoBlocks lets learners try code, change it, and see the analysis update right away.

## Features

**Block editor with Python sync**
- Drag-and-drop block editor built on Blockly.
- Python and blocks stay in sync automatically, so students can move between visual and text coding.
- Overlapping blocks are prevented so nothing is hidden from the learner.

**Complexity analyzer**
- Estimates **time and space complexity** for submitted Python code.
- Recognizes nine notations: O(1), O(log n), O(sqrt n), O(n), O(n log n), O(n²), O(2ⁿ), O(n!), and O(V+E).
- Identifies the algorithm paradigm (for example brute force or dynamic programming).
- Gives **line-by-line explanations** of what each line does, built from the actual syntax and variables.
- Simplified "local analysis" text written for 2nd- and 3rd-year CS students.

**Learning activities**
- **143 hands-on coding activities** across **7 modules**.
- Templates for common algorithms, including graph traversal for directed and undirected graphs.
- Output and error handling that shows real Python errors, such as `NameError` for undeclared variables, and clears the console on each run.

**Accounts and admin**
- Secure login.
- Admin dashboard and pipeline view for reviewing activities and results.

## How the Analyzer Works

1. The submitted Python code is parsed into a syntax tree.
2. Loops, recursion and data structure use are examined to estimate how running time and memory grow with input size.
3. The result is matched to one of the supported notations.
4. A sentence builder reads each line's syntax and variables and writes a plain-language explanation.

The analyzer is tuned for teaching, not for proving complexity in general. It uses simple, predictable rules so learners can follow the reasoning.

<!-- TODO: add a short note on known limitations, for example how variables used as sizes are treated -->

## Results

Evaluated for the thesis:

| Measure | Result |
|---|---|
| Algorithms in the benchmark | 273 |
| Analyzer accuracy | over 91% |
| Feedback time | under 120 ms per submission |
| Student test score (30 students) | average rose from **29.7%** to **74.9%** |
| Usability and quality rating | **4.0 / 4.0** median, from 30 students and 6 IT experts |

## Tech Stack

- **Analyzer / backend:** Python (TODO: framework, for example FastAPI)
- **Block editor:** Blockly
- **Frontend:** TODO
- **Database:** TODO
- **Auth:** TODO

<!-- TODO: replace the TODO lines with the stack the repo actually uses -->

## Getting Started

### Requirements

- Python 3.x (TODO: exact version)
- Node.js (TODO: only if the frontend needs it)
- TODO: database

### Run locally

```bash
git clone https://github.com/R9jin/algoblocks.git
cd algoblocks

# TODO: replace with the repo's real setup steps
pip install -r requirements.txt
# copy the example environment file and fill in your values
cp .env.example .env
# start the app
# TODO: add the run command
```

Do not commit your `.env` file. Keep all secrets out of the repository.

## Project Structure

```
algoblocks/
  backend/      analyzer and API
  frontend/     block editor and UI
  docs/         screenshots
```

<!-- TODO: update to match the repo -->

## Credits

**Developer:** Roginne Geoffrey T. Ticao (Lead Developer)
**Thesis adviser:** TODO
**Thesis team:** TODO

Built for the University of Cabuyao (Pamantasan ng Cabuyao), BS Computer Science, 2026.

## License

TODO – choose a license, or write "All rights reserved" for a thesis project.
