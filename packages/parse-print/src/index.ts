import {parse as babelParse, ParserOptions} from '@babel/parser';
import * as t from '@babel/types';
import NodeReplacements from './NodeReplacements';
import Generator, {PrintOptions, PrintOptionsOverride} from './Generator';

export {t};

export default function parse(
  src: string,
  opts?: Omit<ParserOptions, 'ranges'>,
): ParsePrint {
  const ast = babelParse(src, {ranges: true, ...opts});
  const replacements = new NodeReplacements();
  const overrides = new PrintOptionsOverride();
  return {
    ast,
    replace: replacements.replace.bind(replacements),
    overridePrintOptions: overrides.setOverride.bind(overrides),
    print(options) {
      const g = new Generator({
        source: src,
        replacements,
        overrides,
        options: options || {},
      });
      return g.generate(ast).code;
    },
  };
}
interface ParsePrint {
  ast: t.File;
  replace(node: t.Node, ...replacements: t.Node[]): void;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
  print(options?: PrintOptions): string;
}
