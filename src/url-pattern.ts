import { ParseOptions, parse, Token, tokensToRegexp, TokensToRegexpOptions } from './path-to-regex-modified';
import { URLPatternResult, URLPatternInit, URLPatternKeys, URLPatternOptions } from './url-pattern.interfaces';
import {
  DEFAULT_OPTIONS,
  HOSTNAME_OPTIONS,
  PATHNAME_OPTIONS,
  canonicalizeHash,
  canonicalizeHostname,
  canonicalizePassword,
  canonicalizePathname,
  canonicalizePort,
  canonicalizeProtocol,
  canonicalizeSearch,
  canonicalizeUsername,
  defaultPortForProtocol,
  treatAsIPv6Hostname,
  isAbsolutePathname,
  isSpecialScheme,
  protocolEncodeCallback,
  usernameEncodeCallback,
  passwordEncodeCallback,
  hostnameEncodeCallback,
  ipv6HostnameEncodeCallback,
  portEncodeCallback,
  standardURLPathnameEncodeCallback,
  pathURLPathnameEncodeCallback,
  searchEncodeCallback,
  hashEncodeCallback,
} from './url-utils';
import { Parser } from './url-pattern-parser';

// Define the components in a URL.  The ordering of this constant list is
// signficant to the implementation below.
const COMPONENTS: URLPatternKeys[] = [
  'protocol',
  'username',
  'password',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
];

// The default wildcard pattern used for a component when the constructor
// input does not provide an explicit value.
const DEFAULT_PATTERN = '*';

function extractValues(url: string, baseURL?: string): URLPatternInit {
  if (typeof url !== "string") {
    throw new TypeError(`parameter 1 is not of type 'string'.`);
  }
  const o = new URL(url, baseURL); // May throw.
  return {
    protocol: o.protocol.substring(0, o.protocol.length - 1),
    username: o.username,
    password: o.password,
    hostname: o.hostname,
    port: o.port,
    pathname: o.pathname,
    search: o.search != '' ? o.search.substring(1, o.search.length) : undefined,
    hash: o.hash != '' ? o.hash.substring(1, o.hash.length) : undefined,
  };
}

function processBaseURLString(input: string, isPattern: boolean) {
  if (!isPattern) {
    return input;
  }

  return escapePatternString(input);
}

// A utility method that takes a URLPatternInit, splits it apart, and applies
// the individual component values in the given set of strings.  The strings
// are only applied if a value is present in the init structure.
function applyInit(o: URLPatternInit, init: URLPatternInit, isPattern: boolean): URLPatternInit {
  // If there is a baseURL we need to apply its component values first.  The
  // rest of the URLPatternInit structure will then later override these
  // values.  Note, the baseURL will always set either an empty string or
  // longer value for each considered component.  We do not allow null strings
  // to persist for these components past this phase since they should no
  // longer be treated as wildcards.
  let baseURL;
  if (typeof init.baseURL === 'string') {
    try {
      baseURL = new URL(init.baseURL);
      o.protocol = processBaseURLString(baseURL.protocol.substring(0, baseURL.protocol.length - 1), isPattern);
      o.username = processBaseURLString(baseURL.username, isPattern);
      o.password = processBaseURLString(baseURL.password, isPattern);
      o.hostname = processBaseURLString(baseURL.hostname, isPattern);
      o.port = processBaseURLString(baseURL.port, isPattern);
      o.pathname = processBaseURLString(baseURL.pathname, isPattern);
      o.search = processBaseURLString(baseURL.search.substring(1, baseURL.search.length), isPattern);
      o.hash = processBaseURLString(baseURL.hash.substring(1, baseURL.hash.length), isPattern);
    } catch {
      throw new TypeError(`invalid baseURL '${init.baseURL}'.`);
    }
  }

  // Apply the URLPatternInit component values on top of the default and
  // baseURL values.
  if (typeof init.protocol === 'string') {
    o.protocol = canonicalizeProtocol(init.protocol, isPattern);
  }

  if (typeof init.username === 'string') {
    o.username = canonicalizeUsername(init.username, isPattern);
  }

  if (typeof init.password === 'string') {
    o.password = canonicalizePassword(init.password, isPattern);
  }

  if (typeof init.hostname === 'string') {
    o.hostname = canonicalizeHostname(init.hostname, isPattern);
  }

  if (typeof init.port === 'string') {
    o.port = canonicalizePort(init.port, o.protocol, isPattern);
  }

  if (typeof init.pathname === 'string') {
    o.pathname = init.pathname;
    if (baseURL && !isAbsolutePathname(o.pathname, isPattern)) {
      // Find the last slash in the baseURL pathname.  Since the URL is
      // hierarchical it should have a slash to be valid, but we are cautious
      // and check.  If there is no slash then we cannot use resolve the
      // relative pathname and just treat the init pathname as an absolute
      // value.
      const slashIndex = baseURL.pathname.lastIndexOf('/');
      if (slashIndex >= 0) {
        // Extract the baseURL path up to and including the first slash.
        // Append the relative init pathname to it.
        o.pathname = processBaseURLString(baseURL.pathname.substring(0, slashIndex + 1), isPattern) + o.pathname;
      }
    }
    o.pathname = canonicalizePathname(o.pathname, o.protocol, isPattern);
  }

  if (typeof init.search === 'string') {
    o.search = canonicalizeSearch(init.search, isPattern);
  }

  if (typeof init.hash === 'string') {
    o.hash = canonicalizeHash(init.hash, isPattern);
  }

  return o;
}

function escapePatternString(value: string): string {
  return value.replace(/([+*?:{}()\\])/g, '\\$1');
}

function escapeRegexpString(value: string): string {
  return value.replace(/([.+*?^${}()[\]|/\\])/g, '\\$1');
}

// A utility function to convert a list of path-to-regexp Tokens back into
// a pattern string.  The resulting pattern should be equivalent to the
// original parsed pattern, although they may differ due to canonicalization.
function tokensToPattern(tokens: Token[],
  options: TokensToRegexpOptions & ParseOptions): string {
  const wildcardPattern = ".*";
  const segmentWildcardPattern =
    `[^${escapeRegexpString(options.delimiter === undefined ? '/#?' : options.delimiter)}]+?`;
  const regexIdentifierPart = /[$_‌‍[0-9A-Z_a-z\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05EF-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u07FD\u0800-\u082D\u0840-\u085B\u0860-\u086A\u08A0-\u08B4\u08B6-\u08C7\u08D3-\u08E1\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u09FC\u09FE\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9-\u0AFF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B55-\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C80-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D00-\u0D0C\u0D0E-\u0D10\u0D12-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D54-\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D81-\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1878\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1ABF\u1AC0\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CD0-\u1CD2\u1CD4-\u1CFA\u1D00-\u1DF9\u1DFB-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7BF\uA7C2-\uA7CA\uA7F5-\uA827\uA82C\uA840-\uA873\uA880-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDD00-\uDD27\uDD30-\uDD39\uDE80-\uDEA9\uDEAB\uDEAC\uDEB0\uDEB1\uDF00-\uDF1C\uDF27\uDF30-\uDF50\uDFB0-\uDFC4\uDFE0-\uDFF6]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD44-\uDD47\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDC9-\uDDCC\uDDCE-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE3E\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3B-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC00-\uDC4A\uDC50-\uDC59\uDC5E-\uDC61\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB8\uDEC0-\uDEC9\uDF00-\uDF1A\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDC00-\uDC3A\uDCA0-\uDCE9\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD35\uDD37\uDD38\uDD3B-\uDD43\uDD50-\uDD59\uDDA0-\uDDA7\uDDAA-\uDDD7\uDDDA-\uDDE1\uDDE3\uDDE4\uDE00-\uDE3E\uDE47\uDE50-\uDE99\uDE9D\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC36\uDC38-\uDC40\uDC50-\uDC59\uDC72-\uDC8F\uDC92-\uDCA7\uDCA9-\uDCB6\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD36\uDD3A\uDD3C\uDD3D\uDD3F-\uDD47\uDD50-\uDD59\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD8E\uDD90\uDD91\uDD93-\uDD98\uDDA0-\uDDA9\uDEE0-\uDEF6\uDFB0]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE7F\uDF00-\uDF4A\uDF4F-\uDF87\uDF8F-\uDF9F\uDFE0\uDFE1\uDFE3\uDFE4\uDFF0\uDFF1]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82C[\uDC00-\uDD1E\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD838[\uDC00-\uDC06\uDC08-\uDC18\uDC1B-\uDC21\uDC23\uDC24\uDC26-\uDC2A\uDD00-\uDD2C\uDD30-\uDD3D\uDD40-\uDD49\uDD4E\uDEC0-\uDEF9]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6\uDD00-\uDD4B\uDD50-\uDD59]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD83E[\uDFF0-\uDFF9]|\uD869[\uDC00-\uDEDD\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A]|\uDB40[\uDD00-\uDDEF]]/;

  let result = "";
  for (let i = 0; i < tokens.length; ++i) {
    const token = tokens[i];
    const lastToken = i > 0 ? tokens[i - 1] : null;
    const nextToken: any = i < tokens.length - 1 ? tokens[i + 1] : null;

    // Plain text tokens can be directly added to the pattern string.
    if (typeof token === 'string') {
      result += escapePatternString(token);
      continue;
    }

    // Tokens without a pattern are also plain text, but were originally
    // contained in a `{ ... }` group.  There may be a modifier following
    // the group.  If there is no modifier then we strip the braces off
    // as they are superfluous.
    if (token.pattern === '') {
      if (token.modifier === '') {
        result += escapePatternString(token.prefix);
        continue;
      }
      result += `{${escapePatternString(token.prefix)}}${token.modifier}`;
      continue;
    }

    // Determine if the token name was custom or automatically assigned.
    const customName = typeof token.name !== 'number';

    // Determine if the token needs a grouping like `{ ... }`.  This is
    // necessary when the group:
    //
    // 1. is using a non-automatic prefix or any suffix.
    const optionsPrefixes = options.prefixes !== undefined ? options.prefixes
      : "./";
    let needsGrouping =
      token.suffix !== "" ||
      (token.prefix !== "" &&
        (token.prefix.length !== 1 ||
          !optionsPrefixes.includes(token.prefix)));

    // 2. following by a matching group that may be expressed in a way that can
    //    be mistakenly interpreted as part of the matching group.  For
    //    example:
    //
    //    a. An `(...)` expression following a `:foo` group.  We want to output
    //       `{:foo}(...)` and not `:foo(...)`.
    //    b. A plain text expression following a `:foo` group where the text
    //       could be mistakenly interpreted as part of the name.  We want to
    //       output `{:foo}bar` and not `:foobar`.
    if (!needsGrouping && customName &&
      token.pattern === segmentWildcardPattern &&
      token.modifier === "" && nextToken && !nextToken.prefix &&
      !nextToken.suffix) {
      if (typeof nextToken === "string") {
        const code = nextToken.length > 0 ? nextToken[0] : "";
        needsGrouping = regexIdentifierPart.test(code);
      } else {
        needsGrouping = typeof nextToken.name === "number";
      }
    }

    // 3. preceded by a fixed text part that ends with an implicit prefix
    //    character (like `/`).  This occurs when the original pattern used
    //    an escape or grouping to prevent the implicit prefix; e.g.
    //    `\\/*` or `/{*}`.  In these cases we use a grouping to prevent the
    //    implicit prefix in the generated string.
    if (!needsGrouping && token.prefix === "" && lastToken &&
      typeof lastToken === "string" && lastToken.length > 0) {
      const code = lastToken[lastToken.length - 1];
      needsGrouping = optionsPrefixes.includes(code);
    }

    // This is a full featured token.  We must generate a string that looks
    // like:
    //
    //  { <prefix> <pattern> <suffix> } <modifier>
    //
    // Where the { and } may not be needed.  The <pattern> will be a regexp,
    // named group, or wildcard.
    if (needsGrouping) {
      result += '{';
    }

    result += escapePatternString(token.prefix);

    if (customName) {
      result += `:${token.name}`;
    }

    if (token.pattern === wildcardPattern) {
      // We can only use the `*` wildcard card if we meet a number of
      // conditions.  We must use an explicit `(.*)` group if:
      //
      // 1. A custom name was used; e.g. `:foo(.*)`.
      // 2. If the preceding group is a matching group without a modifier; e.g.
      //    `(foo)(.*)`.  In that case we cannot emit the `*` shorthand without
      //    it being mistakenly interpreted as the modifier for the previous
      //    group.
      if (!customName && (!lastToken ||
        typeof lastToken === 'string' ||
        lastToken.modifier ||
        needsGrouping ||
        token.prefix !== "")) {
        result += '*';
      } else {
        result += `(${wildcardPattern})`;
      }
    } else if (token.pattern === segmentWildcardPattern) {
      // We only need to emit a regexp if a custom name was
      // not specified.  A custom name like `:foo` gets the
      // kSegmentWildcard type automatically.
      if (!customName) {
        result += `(${segmentWildcardPattern})`;
      }
    } else {
      result += `(${token.pattern})`;
    }

    // If the matching group is a simple `:foo` custom name with the default
    // segment wildcard, then we must check for a trailing suffix that could
    // be interpreted as a trailing part of the name itself.  In these cases
    // we must escape the beginning of the suffix in order to separate it
    // from the end of the custom name; e.g. `:foo\\bar` instead of `:foobar`.
    if (token.pattern === segmentWildcardPattern && customName &&
      token.suffix !== "") {
      if (regexIdentifierPart.test(token.suffix[0])) {
        result += '\\';
      }
    }

    result += escapePatternString(token.suffix);

    if (needsGrouping) {
      result += '}';
    }

    result += token.modifier;
  }

  return result;
}

export class URLPattern {
  private pattern: URLPatternInit;
  private regexp: any = {};
  private keys: any = {};
  private component_pattern: any = {};

  constructor(init: URLPatternInit | string, baseURL?: string, options?: URLPatternOptions);
  constructor(init: URLPatternInit | string, options?: URLPatternOptions);
  constructor(init: URLPatternInit | string = {}, baseURLOrOptions?: string | URLPatternOptions, options?: URLPatternOptions) {
    try {
      let baseURL = undefined;
      if (typeof baseURLOrOptions === 'string') {
        baseURL = baseURLOrOptions;
      } else {
        options = baseURLOrOptions;
      }

      if (typeof init === 'string') {
        const parser = new Parser(init);
        parser.parse();
        init = parser.result;
        if (baseURL === undefined && typeof init.protocol !== 'string') {
          throw new TypeError(`A base URL must be provided for a relative constructor string.`);
        }
        init.baseURL = baseURL;
      } else {
        if (!init || typeof init !== 'object') {
          throw new TypeError(`parameter 1 is not of type 'string' and cannot convert to dictionary.`);
        }
        if (baseURL) {
          throw new TypeError(`parameter 1 is not of type 'string'.`);
        }
      }

      if (typeof options === "undefined") {
        options = { ignoreCase: false };
      }

      const ignoreCaseOptions = { ignoreCase: options.ignoreCase === true };

      const defaults: URLPatternInit = {
        pathname: DEFAULT_PATTERN,
        protocol: DEFAULT_PATTERN,
        username: DEFAULT_PATTERN,
        password: DEFAULT_PATTERN,
        hostname: DEFAULT_PATTERN,
        port: DEFAULT_PATTERN,
        search: DEFAULT_PATTERN,
        hash: DEFAULT_PATTERN,
      };

      this.pattern = applyInit(defaults, init, true);

      if (defaultPortForProtocol(this.pattern.protocol) === this.pattern.port) {
        this.pattern.port = '';
      }

      let component: URLPatternKeys;
      // Iterate in component order so we are sure to compile the protocol
      // before the pathname.  We need to know the protocol in order to know
      // which kind of canonicalization to apply.
      for (component of COMPONENTS) {
        if (!(component in this.pattern))
          continue;
        const options: TokensToRegexpOptions & ParseOptions = {};
        const pattern = this.pattern[component];
        this.keys[component] = [];
        switch (component) {
          case 'protocol':
            Object.assign(options, DEFAULT_OPTIONS);
            options.encodePart = protocolEncodeCallback;
            break;
          case 'username':
            Object.assign(options, DEFAULT_OPTIONS);
            options.encodePart = usernameEncodeCallback;
            break;
          case 'password':
            Object.assign(options, DEFAULT_OPTIONS);
            options.encodePart = passwordEncodeCallback;
            break;
          case 'hostname':
            Object.assign(options, HOSTNAME_OPTIONS);
            if (treatAsIPv6Hostname(pattern)) {
              options.encodePart = ipv6HostnameEncodeCallback;
            } else {
              options.encodePart = hostnameEncodeCallback;
            }
            break;
          case 'port':
            Object.assign(options, DEFAULT_OPTIONS);
            options.encodePart = portEncodeCallback;
            break;
          case 'pathname':
            if (isSpecialScheme(this.regexp.protocol)) {
              Object.assign(options, PATHNAME_OPTIONS, ignoreCaseOptions);
              options.encodePart = standardURLPathnameEncodeCallback;
            } else {
              Object.assign(options, DEFAULT_OPTIONS, ignoreCaseOptions);
              options.encodePart = pathURLPathnameEncodeCallback;
            }
            break;
          case 'search':
            Object.assign(options, DEFAULT_OPTIONS, ignoreCaseOptions);
            options.encodePart = searchEncodeCallback;
            break;
          case 'hash':
            Object.assign(options, DEFAULT_OPTIONS, ignoreCaseOptions);
            options.encodePart = hashEncodeCallback;
            break;
        }
        try {
          const tokens = parse(pattern as string, options);
          this.regexp[component] = tokensToRegexp(tokens, this.keys[component], options);
          this.component_pattern[component] = tokensToPattern(tokens, options);
        } catch {
          // If a pattern is illegal the constructor will throw an exception
          throw new TypeError(`invalid ${component} pattern '${this.pattern[component]}'.`);
        }
      }
    } catch (err: any) {
      throw new TypeError(`Failed to construct 'URLPattern': ${err.message}`);
    }
  }

  test(input: string | URLPatternInit = {}, baseURL?: string) {
    let values: URLPatternInit = {
      pathname: '',
      protocol: '',
      username: '',
      password: '',
      hostname: '',
      port: '',
      search: '',
      hash: '',
    };

    if (typeof (input) !== 'string' && baseURL) {
      throw new TypeError(`parameter 1 is not of type 'string'.`);
    }

    if (typeof input === 'undefined') {
      return false;
    }

    try {
      if (typeof input === 'object') {
        values = applyInit(values, input, false);
      } else {
        values = applyInit(values, extractValues(input, baseURL), false);
      }
    } catch (err: any) {
      // Treat exceptions simply as a failure to match.
      return false;
    }

    let component: URLPatternKeys;
    for (component of COMPONENTS) {
      if (!this.regexp[component].exec(values[component])) {
        return false;
      }
    }

    return true;
  }

  exec(input: string | URLPatternInit = {}, baseURL?: string): URLPatternResult | null | undefined {
    let values: URLPatternInit = {
      pathname: '',
      protocol: '',
      username: '',
      password: '',
      hostname: '',
      port: '',
      search: '',
      hash: '',
    };

    if (typeof (input) !== 'string' && baseURL) {
      throw new TypeError(`parameter 1 is not of type 'string'.`);
    }

    if (typeof input === 'undefined') {
      return;
    }

    try {
      if (typeof input === 'object') {
        values = applyInit(values, input, false);
      } else {
        values = applyInit(values, extractValues(input, baseURL), false);
      }
    } catch (err: any) {
      // Treat exceptions simply as a failure to match.
      return null;
    }

    let result: any = {};
    if (baseURL) {
      result.inputs = [input, baseURL];
    } else {
      result.inputs = [input];
    }

    let component: URLPatternKeys;
    for (component of COMPONENTS) {
      let match = this.regexp[component].exec(values[component]);
      if (!match) {
        return null;
      }

      let groups = {} as Array<string>;
      for (let [i, key] of this.keys[component].entries()) {
        if (typeof key.name === 'string' || typeof key.name === 'number') {
          let value = match[i + 1];
          groups[key.name] = value;
        }
      }

      result[component] = {
        input: values[component] || '',
        groups,
      };
    }

    return result;
  }

  public get protocol() {
    return this.component_pattern.protocol;
  }

  public get username() {
    return this.component_pattern.username;
  }

  public get password() {
    return this.component_pattern.password;
  }

  public get hostname() {
    return this.component_pattern.hostname;
  }

  public get port() {
    return this.component_pattern.port;
  }

  public get pathname() {
    return this.component_pattern.pathname;
  }

  public get search() {
    return this.component_pattern.search;
  }

  public get hash() {
    return this.component_pattern.hash;
  }
}
