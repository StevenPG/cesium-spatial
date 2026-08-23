# Security policy

## Supported versions

The project is pre-1.0. Fixes land on the latest published minor version; older versions are not
patched.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub's security advisory form](https://github.com/StevenPG/cesium-spatial/security/advisories/new)
rather than opening a public issue.

Include what you found, how to reproduce it, and which package and version are affected. You should
expect an acknowledgement within a week.

## Scope

These packages compute cell geometry and hand it to CesiumJS to draw. They make no network requests,
read no credentials, and execute nothing they are given beyond the style callbacks you pass them.

The most plausible issues are therefore denial of service rather than disclosure: an input that
causes a cover to generate an unbounded number of cells, or geometry that locks up a render loop.
Those are in scope and worth reporting.

Vulnerabilities in CesiumJS, `h3-js` or `s2js` should go to those projects. If one of them affects
this project's users through how it is used here, a report is still welcome.
