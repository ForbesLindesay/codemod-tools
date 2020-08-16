const {readdirSync, writeFileSync, statSync, readFileSync} = require('fs');

const LICENSE = readFileSync(__dirname + '/../LICENSE.md');

const tsconfigBuild = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib"
  }
}`;
const tsconfig = `{
  "extends": "../../tsconfig.json"
}`;

const dependencies = require('../package.json').devDependencies;
readdirSync(__dirname + '/../packages').forEach((directory) => {
  if (!statSync(__dirname + '/../packages/' + directory).isDirectory()) {
    return;
  }
  writeFileSync(
    __dirname + '/../packages/' + directory + '/LICENSE.md',
    LICENSE,
  );
  writeFileSync(
    __dirname + '/../packages/' + directory + '/tsconfig.json',
    tsconfig,
  );
  writeFileSync(
    __dirname + '/../packages/' + directory + '/tsconfig.build.json',
    tsconfigBuild,
  );
  let pkg = {};
  try {
    pkg = JSON.parse(
      readFileSync(
        __dirname + '/../packages/' + directory + '/package.json',
        'utf8',
      ),
    );
  } catch (ex) {
    if (ex.code !== 'ENOENT') {
      throw ex;
    }
  }
  const before = JSON.stringify(pkg);
  if (!pkg.name) {
    pkg.name = '@codemod-tools/' + directory;
  }
  if (!pkg.version) {
    pkg.version = '0.0.0';
  }
  if (!pkg.description) {
    pkg.description = '';
  }
  if (!pkg.main) {
    pkg.main = './lib/index.js';
  }
  if (!pkg.module) {
    pkg.module = './lib/index.mjs';
  }
  if (!pkg.exports) {
    pkg.exports = {
      '.': [
        {
          import: './lib/index.mjs',
          require: './lib/index.js',
          default: './lib/index.js',
        },
        './lib/index.js',
      ],
    };
  }
  if (!pkg.types) {
    pkg.types = './lib/index.d.ts';
  }
  if (!pkg.files) {
    pkg.files = ['./lib/'];
  }
  if (!pkg.dependencies) {
    pkg.dependencies = {};
  }
  if (!pkg.scripts) {
    pkg.scripts = {};
  }

  pkg.repository =
    'https://github.com/ForbesLindesay/codemod-tools/tree/master/packages/' +
    directory;
  pkg.bugs = 'https://github.com/ForbesLindesay/codemod-tools/issues';
  // if (existsSync(__dirname + '/../docs/' + directory + '.md')) {
  //   pkg.homepage = 'https://www.atdatabases.org/docs/' + directory;
  //   writeFileSync(
  //     __dirname + '/../packages/' + directory + '/README.md',
  //     '# ' +
  //       pkg.name +
  //       '\n\n' +
  //       'For documentation, see ' +
  //       'https://www.atdatabases.org/docs/' +
  //       directory,
  //   );
  // }
  pkg.license = 'MIT';
  if (!pkg.private) {
    pkg.publishConfig = {
      access: 'public',
    };
  }
  const after = JSON.stringify(pkg);
  if (before === after) {
    return;
  }
  writeFileSync(
    __dirname + '/../packages/' + directory + '/package.json',
    JSON.stringify(pkg, null, '  ') + '\n',
  );
});
