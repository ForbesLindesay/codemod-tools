module.exports = () => {
  return {
    name: 'transform-modules-mjs',

    visitor: {
      ImportDeclaration(path) {
        if (
          path.node.source.value.startsWith('.') &&
          !/\.mjs$/.test(path.node.source.value)
        ) {
          path.replaceWith({
            ...path.node,
            source: {
              ...path.node.source,
              value: `${path.node.source.value}.mjs`,
            },
          });
        }
      },
    },
  };
};
