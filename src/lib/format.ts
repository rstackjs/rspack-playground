export async function format(code: string): Promise<string> {
  try {
    const prettier = await import("prettier");
    // rslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const parserBabel = (await import("prettier/esm/parser-babel.mjs")).default;
    const pluginEstree = (await import("prettier/plugins/estree")).default;
    return prettier.format(code, {
      parser: "babel",
      plugins: [parserBabel, pluginEstree],
    });
  } catch (error) {
    console.warn("Error formatting code:", error);
    return code;
  }
}
