const resolve = require('resolve').sync;
const {dirname} = require('path');
const {isModule} = require('@babel/helper-module-transforms');
const simplifyAccess = require('@babel/helper-simple-access').default;
const {template, types: t} = require('@babel/core');
const builtins = new Set(require('builtins')());

const {
  createDynamicImportTransform,
} = require('babel-plugin-dynamic-import-node/utils');

module.exports = (api) => {
  const transformImportCall = createDynamicImportTransform(api);

  const getAssertion = (localName) => template.expression.ast`
    (function(){
      throw new Error(
        "The CommonJS '" + "${localName}" + "' variable is not available in ES6 modules." +
        "Consider setting setting sourceType:script or sourceType:unambiguous in your " +
        "Babel config for this file.");
    })()
  `;

  const moduleExportsVisitor = {
    ReferencedIdentifier(path) {
      const localName = path.node.name;
      if (localName !== 'module' && localName !== 'exports') return;

      const localBinding = path.scope.getBinding(localName);
      const rootBinding = this.scope.getBinding(localName);

      if (
        // redeclared in this scope
        rootBinding !== localBinding ||
        (path.parentPath.isObjectProperty({value: path.node}) &&
          path.parentPath.parentPath.isObjectPattern()) ||
        path.parentPath.isAssignmentExpression({left: path.node}) ||
        path.isAssignmentExpression({left: path.node})
      ) {
        return;
      }

      path.replaceWith(getAssertion(localName));
    },

    AssignmentExpression(path) {
      const left = path.get('left');
      if (left.isIdentifier()) {
        const localName = path.node.name;
        if (localName !== 'module' && localName !== 'exports') return;

        const localBinding = path.scope.getBinding(localName);
        const rootBinding = this.scope.getBinding(localName);

        // redeclared in this scope
        if (rootBinding !== localBinding) return;

        const right = path.get('right');
        right.replaceWith(
          t.sequenceExpression([right.node, getAssertion(localName)]),
        );
      } else if (left.isPattern()) {
        const ids = left.getOuterBindingIdentifiers();
        const localName = Object.keys(ids).filter((localName) => {
          if (localName !== 'module' && localName !== 'exports') return false;

          return (
            this.scope.getBinding(localName) ===
            path.scope.getBinding(localName)
          );
        })[0];

        if (localName) {
          const right = path.get('right');
          right.replaceWith(
            t.sequenceExpression([right.node, getAssertion(localName)]),
          );
        }
      }
    },
  };

  return {
    name: 'transform-modules-commonjs',

    pre() {
      this.file.set('@babel/plugin-transform-modules-*', 'commonjs');
    },

    visitor: {
      CallExpression(path) {
        if (!this.file.has('@babel/plugin-proposal-dynamic-import')) return;
        if (!path.get('callee').isImport()) return;

        let {scope} = path;
        do {
          scope.rename('require');
        } while ((scope = scope.parent));

        transformImportCall(this, path.get('callee'));
      },

      Program: {
        exit(path) {
          if (!isModule(path)) return;

          // Rename the bindings auto-injected into the scope so there is no
          // risk of conflict between the bindings.
          path.scope.rename('exports');
          path.scope.rename('module');
          path.scope.rename('require');
          path.scope.rename('__filename');
          path.scope.rename('__dirname');

          // Rewrite references to 'module' and 'exports' to throw exceptions.
          // These objects are specific to CommonJS and are not available in
          // real ES6 implementations.
          simplifyAccess(path, new Set(['module', 'exports']));
          path.traverse(moduleExportsVisitor, {
            scope: path.scope,
          });

          const filename = this.file.opts.filename;
          path.node.sourceType = 'script';
          const hasStrict = path.node.directives.some((directive) => {
            return directive.value.value === 'use strict';
          });
          if (!hasStrict) {
            path.unshiftContainer(
              'directives',
              t.directive(t.directiveLiteral('use strict')),
            );
          }

          let hasDefault = false;
          path.traverse({
            ImportDeclaration(path) {
              const {specifiers, source} = path.node;
              const sourcePath = source.value.startsWith('.')
                ? null
                : builtins.has(source.value)
                ? source.value
                : resolve(source.value, {
                    basedir: dirname(filename),
                  });
              const fixedSource = source.value.startsWith('.')
                ? t.stringLiteral(source.value.replace(/(\.mjs)?$/, '.js'))
                : source;
              const requiresTrueDefault = () => {
                if (sourcePath === null) return false;
                if (builtins.has(sourcePath)) return false;
                const mod = require(sourcePath);
                return mod !== mod.default;
              };
              if (
                specifiers.length === 1 &&
                t.isImportNamespaceSpecifier(specifiers[0])
              ) {
                path.replaceWith(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      specifiers[0].local,
                      t.callExpression(t.identifier('require'), [fixedSource]),
                    ),
                  ]),
                );
              } else {
                const defaultImport = specifiers.find((s) =>
                  t.isImportDefaultSpecifier(s),
                );
                const namedSpecifiers = specifiers
                  .filter((s) => t.isImportSpecifier(s))
                  .map((s) =>
                    s.local.name === s.imported.name
                      ? t.objectProperty(s.imported, s.local, false, true)
                      : t.objectProperty(s.imported, s.local),
                  );
                const defaultImportTransformed =
                  defaultImport &&
                  (requiresTrueDefault()
                    ? t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.objectPattern([
                            t.objectProperty(
                              t.identifier('default'),
                              defaultImport.local,
                            ),
                            ...namedSpecifiers,
                          ]),
                          t.callExpression(t.identifier('require'), [
                            fixedSource,
                          ]),
                        ),
                      ])
                    : t.variableDeclaration('const', [
                        t.variableDeclarator(
                          specifiers[0].local,
                          t.callExpression(t.identifier('require'), [
                            fixedSource,
                          ]),
                        ),
                      ]));
                if (
                  defaultImportTransformed &&
                  (specifiers.length === 1 || requiresTrueDefault())
                ) {
                  path.replaceWith(defaultImportTransformed);
                } else if (defaultImport) {
                  path.replaceWithMultiple([
                    defaultImportTransformed,
                    t.variableDeclaration('const', [
                      t.variableDeclarator(
                        t.objectPattern([...namedSpecifiers]),
                        defaultImport.local,
                      ),
                    ]),
                  ]);
                } else {
                  path.replaceWith(
                    t.variableDeclaration('const', [
                      t.variableDeclarator(
                        t.objectPattern([...namedSpecifiers]),
                        t.callExpression(t.identifier('require'), [
                          fixedSource,
                        ]),
                      ),
                    ]),
                  );
                }
              }
            },

            ExportDefaultDeclaration(path) {
              hasDefault = true;
              if (path.node.declaration.id) {
                path.replaceWithMultiple([
                  path.node.declaration,
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(
                        t.identifier('exports'),
                        t.identifier('default'),
                      ),
                      path.node.declaration.id,
                    ),
                  ),
                ]);
              } else {
                path.replaceWith(
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(
                        t.identifier('exports'),
                        t.identifier('default'),
                      ),
                      path.node.declaration,
                    ),
                  ),
                );
              }
            },

            ExportNamedDeclaration(path) {
              const results = [];
              if (path.node.declaration) {
                if (path.node.declaration.id) {
                  results.push(
                    path.node.declaration,
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.memberExpression(
                          t.identifier('exports'),
                          path.node.declaration.id,
                        ),
                        path.node.declaration.id,
                      ),
                    ),
                  );
                } else if (t.isVariableDeclaration(path.node.declaration)) {
                  results.push(path.node.declaration);
                  for (const decl of path.node.declaration.declarations) {
                    results.push(
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.identifier('exports'), decl.id),
                          decl.id,
                        ),
                      ),
                    );
                  }
                } else {
                  throw new Error('Unsupported export node type');
                }
              }
              for (const specifier of path.node.specifiers) {
                if (t.isExportSpecifier(specifier)) {
                  results.push(
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.memberExpression(
                          t.identifier('exports'),
                          specifier.exported,
                        ),
                        specifier.local,
                      ),
                    ),
                  );
                } else {
                  throw new Error('Not implemented yet');
                }
              }
              if (results.length === 1) {
                path.replaceWith(results[0]);
              } else {
                path.replaceWithMultiple(results);
              }
            },
          });

          if (hasDefault) {
            path.node.body.push(
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.identifier('module'),
                    t.identifier('exports'),
                  ),
                  t.callExpression(
                    t.memberExpression(
                      t.identifier('Object'),
                      t.identifier('assign'),
                    ),
                    [
                      t.memberExpression(
                        t.identifier('exports'),
                        t.identifier('default'),
                      ),
                      t.identifier('exports'),
                    ],
                  ),
                ),
              ),
            );
            path.replaceWith(path.node);
          }

          // const {meta, headers} = rewriteModuleStatementsAndPrepareHeader(
          //   path,
          //   {
          //     exportName: 'exports',
          //     loose: false,
          //     strict: false,
          //     strictMode: true,
          //     allowTopLevelThis: false,
          //     noInterop: true,
          //     lazy: false,
          //     esNamespaceOnly: true,
          //   },
          // );

          // for (const [source, metadata] of meta.source) {
          //   const loadExpr = t.callExpression(t.identifier('require'), [
          //     t.stringLiteral(source),
          //   ]);

          //   let header;
          //   if (isSideEffectImport(metadata)) {
          //     header = t.expressionStatement(loadExpr);
          //   } else {
          //     const init =
          //       wrapInterop(path, loadExpr, metadata.interop) || loadExpr;

          //     header = template.ast`
          //       var ${metadata.name} = ${init};
          //     `;
          //   }
          //   header.loc = metadata.loc;

          //   headers.push(header);
          //   headers.push(
          //     ...buildNamespaceInitStatements(meta, metadata, loose),
          //   );
          // }

          // ensureStatementsHoisted(headers);
          // path.unshiftContainer('body', headers);
        },
      },
    },
  };
};
