## Overview
This folder hosts a collection of minimal, focused examples that demonstrate how to build, package, and integrate tools for the Power Platform Tool Box (PPTB). Each sample is self-contained and designed to be read, built, and run independently.

## What’s included
- Self-contained sample tools with their own README and source
- Patterns for configuration, logging, and extensibility
- Packaging/manifest examples and common project scaffolding
- Notes on testing and local development workflows

## Repository layout
- sample/
  - README.md (how to build, run, and use the sample)
  - src/ (source code)
  - assets/ (optional icons/media)
  - manifest.* (if the sample uses a manifest)
  - tests/ (optional)

## Prerequisites
- Git
- A supported runtime/toolchain as specified by each sample (for example Node.js, .NET, or Python)
- PPTB if you plan to load a built tool into the toolbox

## Quick start
1) Clone the repository.
2) Open a sample under sample-tools/<tool-name>.
3) Read that sample’s README for exact build/run steps.
4) Build and run locally using the toolchain noted by the sample.

## Using with PPTB (optional)
- Build the sample following its README.
- In PPTB, add/register the built tool from your local output as instructed by the sample’s README.
- Launch the tool from PPTB and verify expected behavior.

## Contributing
Issues and pull requests are welcome. Please follow the coding style and structure used by existing samples.

## License
See the LICENSE file at the repository root (or the sample’s folder if provided).

## Support
- Check the sample’s README for notes and FAQs.
- Open an issue with diagnostic details if you encounter a problem.