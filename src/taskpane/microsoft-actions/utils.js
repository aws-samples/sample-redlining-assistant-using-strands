/* global console */

import * as React from "react";

// Convert text with \n line breaks to JSX with <br/> elements
export function renderTextWithLineBreaks(text) {
  if (!text) return "";
  return text.split("\n").map((line, index) => (
    <React.Fragment key={index}>
      {line}
      {index < text.split("\n").length - 1 && <br />}
    </React.Fragment>
  ));
}
