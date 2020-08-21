// @ts-expect-error
import Printer from '@babel/generator/lib/printer';
import * as t from '@babel/types';
import NodeReplacements from './NodeReplacements';

enum PrintMode {
  Chunks,
  Ast,
}
interface PrintChunksMode {
  kind: PrintMode.Chunks;
  startIndex: number;
  endIndex: number;
}
interface PrintAstMode {
  kind: PrintMode.Ast;
}

declare class PrinterTypes {
  protected format: Format;

  constructor(format: Format, x: null);

  protected indent(): unknown;
  protected dedent(): unknown;
  protected newline(lines?: number): unknown;

  protected _append(str: string, queue?: boolean): void;
  protected _maybeIndent(str: string): void;
  protected _printNewline(
    leading: boolean,
    node: t.Node,
    parent: t.Node,
    opts: unknown,
  ): void;

  /**
   * Generate code and sourcemap from ast.
   *
   * Appends comments that weren't attached to any node to the end of the generated output.
   */
  public generate(ast: t.Node): {code: string};
  protected print(node: t.Node | null, parent?: t.Node): unknown;
}

export default class Generator extends (Printer as typeof PrinterTypes) {
  private readonly _codemodToolsStack = new Set<t.Node>();
  private _codemodToolsPrintMode: PrintChunksMode | PrintAstMode = {
    kind: PrintMode.Ast,
  };
  private readonly _codemodToolsReplacements: NodeReplacements;
  private readonly _codemodToolsSource: string;
  private readonly _codemodToolsOverrides: PrintOptionsOverride;
  private readonly _codemodToolsFormatOverridesStack = new Set<t.Node>();
  constructor({
    options,
    source,
    replacements,
    overrides,
  }: {
    options: PrintOptions;
    source: string;
    replacements: NodeReplacements;
    overrides: PrintOptionsOverride;
  }) {
    super(normalizeOptions(options), null);
    this.format = normalizeOptions(options);
    this._codemodToolsReplacements = replacements;
    this._codemodToolsSource = source;
    this._codemodToolsOverrides = overrides;
  }

  protected _append(str: string, queue = false) {
    if (this._codemodToolsPrintMode.kind === PrintMode.Chunks) return;
    super._append(str, queue);
  }

  protected _maybeIndent(str: string) {
    if (this._codemodToolsPrintMode.kind === PrintMode.Chunks) return;
    super._maybeIndent(str);
  }

  protected printJoin(
    nodes: t.Node[],
    parent: t.Node,
    opts: {
      indent?: boolean;
      addNewlines?: unknown;
      statement?: boolean;
      iterator?: (node: t.Node, index: number) => void;
      separator?: any;
    } = {},
  ) {
    if (!nodes?.length) return;

    if (opts.indent) this.indent();

    const newlineOpts = {
      addNewlines: opts.addNewlines,
    };

    const attemptToReuseOriginalWhitespace = this._codemodToolsReplacements.isRemovalParent(
      parent,
    );
    let previous: t.Node | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      if (this._codemodToolsReplacements.isRemoved(parent, node)) {
        previous = null;
        continue;
      }

      let next: t.Node | null = null;
      for (let j = i + 1; j < nodes.length && next === null; j++) {
        next = nodes[j];
      }
      if (next && this._codemodToolsReplacements.isRemoved(parent, next)) {
        next = null;
      }

      if (
        attemptToReuseOriginalWhitespace &&
        hasRange(previous) &&
        hasRange(node)
      ) {
        this._append(
          this._codemodToolsSource.slice(previous.range[1], node.range[0]),
          true,
        );
      } else if (opts.statement) {
        this._printNewline(true, node, parent, newlineOpts);
      }

      this.print(node, parent);

      if (
        attemptToReuseOriginalWhitespace &&
        hasRange(next) &&
        hasRange(node)
      ) {
        // do nothing
      } else {
        if (opts.iterator) {
          opts.iterator(node, i);
        }
        if (opts.separator && i < nodes.length - 1) {
          opts.separator.call(this);
        }
        if (opts.statement) {
          this._printNewline(false, node, parent, newlineOpts);
        }
      }

      previous = node;
    }

    if (opts.indent) this.dedent();
  }
  protected print(node: t.Node | null, parent?: t.Node): unknown {
    if (!node) return super.print(node, parent);
    if (!this._codemodToolsFormatOverridesStack.has(node)) {
      const printOverride = getOverrideFormat(
        node,
        this._codemodToolsOverrides,
      );
      if (printOverride) {
        const oldFormat = this.format;
        try {
          this._codemodToolsFormatOverridesStack.add(node);
          this.format = printOverride;
          return this.print(node, parent);
        } finally {
          this.format = oldFormat;
          this._codemodToolsFormatOverridesStack.delete(node);
        }
      }
    }
    if (this._codemodToolsPrintMode.kind === PrintMode.Chunks) {
      if (!hasRange(node)) {
        throw new Error('Expected original node to have "range".');
      }
      const {startIndex, endIndex} = this._codemodToolsPrintMode;
      this._codemodToolsPrintMode = {kind: PrintMode.Ast};
      // swap mode
      if (node.range[0] > startIndex) {
        this._append(
          this._codemodToolsSource.slice(startIndex, node.range[0]),
          true,
        );
      }
      const result = this.print(node, parent);
      this._codemodToolsPrintMode = {
        kind: PrintMode.Chunks,
        startIndex: node.range[1],
        endIndex,
      };
      return result;
    }

    if (!this._codemodToolsStack.has(node)) {
      const replacements = this._codemodToolsReplacements.resolve(node);
      if (replacements) {
        this._codemodToolsStack.add(node);
        try {
          for (const r of replacements) {
            this.print(r, parent);
          }
          return undefined;
        } finally {
          this._codemodToolsStack.delete(node);
        }
      }
    }
    const removed = this._codemodToolsReplacements.resolveRemovals(node, {
      keepChildren: true,
    });
    if (removed) {
      return this.print(removed, parent);
    }

    if (hasRange(node)) {
      this._codemodToolsPrintMode = {
        kind: PrintMode.Chunks,
        startIndex: node.range[0],
        endIndex: node.range[1],
      };
      const result = super.print(node, parent);
      if (this._codemodToolsPrintMode.kind !== PrintMode.Chunks) {
        throw new Error('Expected print to end in chunks mode.');
      }
      const startIndex = this._codemodToolsPrintMode.startIndex;
      this._codemodToolsPrintMode = {kind: PrintMode.Ast};
      this._append(
        this._codemodToolsSource.slice(startIndex, node.range[1]),
        true,
      );
      return result;
    }
    return super.print(node, parent);
  }
}

function hasRange(
  node: t.Node | null | undefined,
): node is t.Node & {range: [number, number]} {
  return (
    node &&
    'range' in node &&
    Array.isArray((node as any).range) &&
    (node as any).range.length === 2 &&
    (node as any).range.every((v: unknown) => typeof v === 'number')
  );
}

// Taken from https://github.com/babel/babel/blob/059e9124ffb61b510fc21ec0b5629b3c899cbf1f/packages/babel-generator/src/printer.js#L12-L28
interface Format {
  shouldPrintComment: (comment: string) => boolean;
  retainLines: boolean;
  retainFunctionParens: boolean;
  comments: boolean;
  auxiliaryCommentBefore?: string;
  auxiliaryCommentAfter?: string;
  compact: boolean | 'auto';
  minified: boolean;
  concise: boolean;
  indent: {
    adjustMultilineComment: boolean;
    style: string;
    base: number;
  };
  decoratorsBeforeExport: boolean;
  jsonCompatibleStrings: boolean;
  jsescOption: any;
  recordAndTupleSyntaxType: string;
}

export interface PrintOptions {
  /**
   * Optional string to add as a block comment at the start of the output file
   */
  auxiliaryCommentBefore?: string;
  /**
   * Optional string to add as a block comment at the end of the output file
   */
  auxiliaryCommentAfter?: string;
  /**
   * When enabled, occurrences of </script and </style in the output are escaped as
   * <\/script and <\/style, and <!-- is escaped as \x3C!-- . This setting is useful
   * when jsesc’s output ends up as part of a <script> or <style> element in an HTML
   * document.
   *
   * @default false
   */
  isScriptContext?: boolean;
  strings?: {
    /**
     * The type of quotes to use.
     *
     * If "json" is specified, the strings are guaranteed to be valid JSON strings.
     */
    quotes?: 'json' | 'single' | 'double' | 'backtick';
    /**
     * When enabled, any astral Unicode symbols in the input are escaped using ECMAScript 6
     * Unicode code point escape sequences instead of using separate escape sequences for
     * each surrogate half.
     *
     * N.B. Requires ES6. Set this to false if you need to support older runtimes
     *
     * @default false
     */
    disableUnicodeCodePointEscapes?: boolean;
    /**
     * When enabled, only a limited set of symbols in the output are escaped. With this
     * option enabled, jsesc output is no longer guaranteed to be ASCII-safe, but the
     * source code will be easier to read, especially if it contains emoji.
     *
     * @default false
     */
    minimal?: boolean;
  };
  numbers?: {
    encoding?: 'binary' | 'octal' | 'decimal' | 'hexadecimal';
  };

  /**
   * Enable this to emit decorators attatched to declartaions before their "export" nodes
   *
   * @default false
   */
  decoratorsBeforeExport?: boolean;

  /**
   * When outputting the RecordExpression experimental type, should babel use:
   *
   * bar: {| ... |}
   *
   * or
   *
   * hash: #{ ... }
   *
   * N.B. Defaults to "bar"
   */
  recordAndTupleSyntaxType?: 'bar' | 'hash';
}
function normalizeOptions(opts: PrintOptions = {}): Format {
  return {
    auxiliaryCommentBefore: opts.auxiliaryCommentBefore,
    auxiliaryCommentAfter: opts.auxiliaryCommentAfter,
    shouldPrintComment: () => true,
    retainLines: false,
    retainFunctionParens: true,
    comments: true,
    compact: false,
    minified: false,
    concise: false,
    jsonCompatibleStrings: opts.strings?.quotes === 'json',
    jsescOption: {
      quotes:
        opts.strings?.quotes === 'json'
          ? 'double'
          : opts.strings?.quotes || 'double',
      es6: opts.strings?.disableUnicodeCodePointEscapes !== true,
      minimal: opts.strings?.minimal === true,
      numbers: opts.numbers?.encoding || 'decimal',
      wrap: true,
    },
    indent: {
      adjustMultilineComment: true,
      style: '  ',
      base: 0,
    },
    decoratorsBeforeExport: opts.decoratorsBeforeExport === true,
    recordAndTupleSyntaxType: opts.recordAndTupleSyntaxType || 'bar',
  };
}

export class PrintOptionsOverride {
  private readonly _overrides = new Map<t.Node, Format>();
  public setOverride(node: t.Node, options: PrintOptions) {
    this._overrides.set(node, normalizeOptions(options));
  }
}
function getOverrideFormat(node: t.Node, overrides: PrintOptionsOverride) {
  return ((overrides as any)._overrides as Map<t.Node, Format>).get(node);
}
