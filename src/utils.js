import {
  curveBasis,
  curveBasisClosed,
  curveBasisOpen,
  curveLinear,
  curveLinearClosed,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore
} from 'd3';
import { logger } from './logger';
import { sanitizeUrl } from '@braintree/sanitize-url';
import mermaidAPI from './mermaidAPI';

// Effectively an enum of the supported curve types, accessible by name
const d3CurveTypes = {
  curveBasis: curveBasis,
  curveBasisClosed: curveBasisClosed,
  curveBasisOpen: curveBasisOpen,
  curveLinear: curveLinear,
  curveLinearClosed: curveLinearClosed,
  curveMonotoneX: curveMonotoneX,
  curveMonotoneY: curveMonotoneY,
  curveNatural: curveNatural,
  curveStep: curveStep,
  curveStepAfter: curveStepAfter,
  curveStepBefore: curveStepBefore
};
const directive = /[%]{2}[{]\s*(?:(?:(\w+)\s*:|(\w+))\s*(?:(?:(\w+))|((?:(?![}][%]{2}).|\r?\n)*))?\s*)(?:[}][%]{2})?/gi;
const directiveWithoutOpen = /\s*(?:(?:(\w+)(?=:):|(\w+))\s*(?:(?:(\w+))|((?:(?![}][%]{2}).|\r?\n)*))?\s*)(?:[}][%]{2})?/gi;
const anyComment = /\s*%%.*\n/gm;

/**
 * @function detectInit
 * Detects the init config object from the text and (re)initializes mermaid
 * ```mermaid
 * %%{init: {"theme": "debug", "logLevel": 1 }}%%
 * graph LR
 *  a-->b
 *  b-->c
 *  c-->d
 *  d-->e
 *  e-->f
 *  f-->g
 *  g-->h
 * ```
 * or
 * ```mermaid
 * %%{initialize: {"theme": "dark", logLevel: "debug" }}%%
 * graph LR
 *  a-->b
 *  b-->c
 *  c-->d
 *  d-->e
 *  e-->f
 *  f-->g
 *  g-->h
 * ```
 *
 * @param {string} text The text defining the graph
 * @returns {object} the json object representing the init passed to mermaid.initialize()
 */
export const detectInit = function(text) {
  let inits = detectDirective(text, /(?:init\b)|(?:initialize\b)/);
  let results = {};
  if (Array.isArray(inits)) {
    let args = inits.map(init => init.args);
    results = assignWithDepth(results, ...args);
  } else {
    results = inits.args;
  }
  if (results) {
    mermaidAPI.initialize(results);
  }
  return results;
};

/**
 * @function detectDirective
 * Detects the directive from the text. Text can be single line or multiline. If type is null or omitted
 * the first directive encountered in text will be returned
 * ```mermaid
 * graph LR
 *  %%{somedirective}%%
 *  a-->b
 *  b-->c
 *  c-->d
 *  d-->e
 *  e-->f
 *  f-->g
 *  g-->h
 * ```
 *
 * @param {string} text The text defining the graph
 * @param {string|RegExp} type The directive to return (default: null
 * @returns {object | Array} An object or Array representing the directive(s): { type: string, args: object|null } matchd by the input type
 *          if a single directive was found, that directive object will be returned.
 */
export const detectDirective = function(text, type = null) {
  try {
    const commentWithoutDirectives = new RegExp(
      `[%]{2}(?![{]${directiveWithoutOpen.source})(?=[}][%]{2}).*\n`,
      'ig'
    );
    text = text
      .trim()
      .replace(commentWithoutDirectives, '')
      .replace(/'/gm, '"');
    logger.debug(
      `Detecting diagram directive${type !== null ? ' type:' + type : ''} based on the text:${text}`
    );
    let match,
      result = [];
    while ((match = directive.exec(text)) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (match.index === directive.lastIndex) {
        directive.lastIndex++;
      }
      if (
        (match && !type) ||
        (type && match[1] && match[1].match(type)) ||
        (type && match[2] && match[2].match(type))
      ) {
        let type = match[1] ? match[1] : match[2];
        let args = match[3] ? match[3].trim() : match[4] ? JSON.parse(match[4].trim()) : null;
        result.push({ type, args });
      }
    }
    if (result.length === 0) {
      result.push({ type: text, args: null });
    }

    return result.length === 1 ? result[0] : result;
  } catch (error) {
    logger.error(
      `ERROR: ${error.message} - Unable to parse directive${
        type !== null ? ' type:' + type : ''
      } based on the text:${text}`
    );
    return { type: null, args: null };
  }
};

/**
 * @function detectType
 * Detects the type of the graph text. Takes into consideration the possible existence of an %%init
 * directive
 * ```mermaid
 * %%{initialize: {"startOnLoad": true, logLevel: "fatal" }}%%
 * graph LR
 *  a-->b
 *  b-->c
 *  c-->d
 *  d-->e
 *  e-->f
 *  f-->g
 *  g-->h
 * ```
 *
 * @param {string} text The text defining the graph
 * @returns {string} A graph definition key
 */
export const detectType = function(text) {
  text = text.replace(directive, '').replace(anyComment, '\n');
  logger.debug('Detecting diagram type based on the text ' + text);
  if (text.match(/^\s*sequenceDiagram/)) {
    return 'sequence';
  }

  if (text.match(/^\s*gantt/)) {
    return 'gantt';
  }

  if (text.match(/^\s*classDiagram/)) {
    return 'class';
  }
  if (text.match(/^\s*stateDiagram-v2/)) {
    return 'stateDiagram';
  }

  if (text.match(/^\s*stateDiagram/)) {
    return 'state';
  }

  if (text.match(/^\s*gitGraph/)) {
    return 'git';
  }
  if (text.match(/^\s*flowchart/)) {
    return 'flowchart-v2';
  }

  if (text.match(/^\s*info/)) {
    return 'info';
  }
  if (text.match(/^\s*pie/)) {
    return 'pie';
  }

  if (text.match(/^\s*erDiagram/)) {
    return 'er';
  }

  if (text.match(/^\s*journey/)) {
    return 'journey';
  }

  return 'flowchart';
};

/**
 * @function isSubstringInArray
 * Detects whether a substring in present in a given array
 * @param {string} str The substring to detect
 * @param {array} arr The array to search
 * @returns {number} the array index containing the substring or -1 if not present
 **/
export const isSubstringInArray = function(str, arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].match(str)) return i;
  }
  return -1;
};

export const interpolateToCurve = (interpolate, defaultCurve) => {
  if (!interpolate) {
    return defaultCurve;
  }
  const curveName = `curve${interpolate.charAt(0).toUpperCase() + interpolate.slice(1)}`;
  return d3CurveTypes[curveName] || defaultCurve;
};

export const formatUrl = (linkStr, config) => {
  let url = linkStr.trim();

  if (url) {
    if (config.securityLevel !== 'loose') {
      return sanitizeUrl(url);
    }

    return url;
  }
};

export const runFunc = (functionName, ...params) => {
  var arrPaths = functionName.split('.');

  var len = arrPaths.length - 1;
  var fnName = arrPaths[len];

  var obj = window;
  for (var i = 0; i < len; i++) {
    obj = obj[arrPaths[i]];
    if (!obj) return;
  }

  obj[fnName](...params);
};

const distance = (p1, p2) =>
  p1 && p2 ? Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) : 0;

const traverseEdge = points => {
  let prevPoint;
  let totalDistance = 0;

  points.forEach(point => {
    totalDistance += distance(point, prevPoint);
    prevPoint = point;
  });

  // Traverse half of total distance along points
  const distanceToLabel = totalDistance / 2;

  let remainingDistance = distanceToLabel;
  let center;
  prevPoint = undefined;
  points.forEach(point => {
    if (prevPoint && !center) {
      const vectorDistance = distance(point, prevPoint);
      if (vectorDistance < remainingDistance) {
        remainingDistance -= vectorDistance;
      } else {
        // The point is remainingDistance from prevPoint in the vector between prevPoint and point
        // Calculate the coordinates
        const distanceRatio = remainingDistance / vectorDistance;
        if (distanceRatio <= 0) center = prevPoint;
        if (distanceRatio >= 1) center = { x: point.x, y: point.y };
        if (distanceRatio > 0 && distanceRatio < 1) {
          center = {
            x: (1 - distanceRatio) * prevPoint.x + distanceRatio * point.x,
            y: (1 - distanceRatio) * prevPoint.y + distanceRatio * point.y
          };
        }
      }
    }
    prevPoint = point;
  });
  return center;
};

const calcLabelPosition = points => {
  const p = traverseEdge(points);
  return p;
};

const calcCardinalityPosition = (isRelationTypePresent, points, initialPosition) => {
  let prevPoint;
  let totalDistance = 0; // eslint-disable-line
  if (points[0] !== initialPosition) {
    points = points.reverse();
  }
  points.forEach(point => {
    totalDistance += distance(point, prevPoint);
    prevPoint = point;
  });

  // Traverse only 25 total distance along points to find cardinality point
  const distanceToCardinalityPoint = 25;

  let remainingDistance = distanceToCardinalityPoint;
  let center;
  prevPoint = undefined;
  points.forEach(point => {
    if (prevPoint && !center) {
      const vectorDistance = distance(point, prevPoint);
      if (vectorDistance < remainingDistance) {
        remainingDistance -= vectorDistance;
      } else {
        // The point is remainingDistance from prevPoint in the vector between prevPoint and point
        // Calculate the coordinates
        const distanceRatio = remainingDistance / vectorDistance;
        if (distanceRatio <= 0) center = prevPoint;
        if (distanceRatio >= 1) center = { x: point.x, y: point.y };
        if (distanceRatio > 0 && distanceRatio < 1) {
          center = {
            x: (1 - distanceRatio) * prevPoint.x + distanceRatio * point.x,
            y: (1 - distanceRatio) * prevPoint.y + distanceRatio * point.y
          };
        }
      }
    }
    prevPoint = point;
  });
  // if relation is present (Arrows will be added), change cardinality point off-set distance (d)
  let d = isRelationTypePresent ? 10 : 5;
  //Calculate Angle for x and y axis
  let angle = Math.atan2(points[0].y - center.y, points[0].x - center.x);
  let cardinalityPosition = { x: 0, y: 0 };
  //Calculation cardinality position using angle, center point on the line/curve but pendicular and with offset-distance
  cardinalityPosition.x = Math.sin(angle) * d + (points[0].x + center.x) / 2;
  cardinalityPosition.y = -Math.cos(angle) * d + (points[0].y + center.y) / 2;
  return cardinalityPosition;
};

export const getStylesFromArray = arr => {
  let style = '';
  let labelStyle = '';

  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== 'undefined') {
      // add text properties to label style definition
      if (arr[i].startsWith('color:') || arr[i].startsWith('text-align:')) {
        labelStyle = labelStyle + arr[i] + ';';
      } else {
        style = style + arr[i] + ';';
      }
    }
  }

  return { style: style, labelStyle: labelStyle };
};

let cnt = 0;
export const generateId = () => {
  cnt++;
  return (
    'id-' +
    Math.random()
      .toString(36)
      .substr(2, 12) +
    '-' +
    cnt
  );
};

export const assignWithDepth = function(dst, src, depth = 2) {
  if (depth <= 0) {
    if (dst !== undefined && dst !== null && typeof dst === 'object' && typeof src === 'object') {
      return Object.assign(dst, src);
    } else {
      return src;
    }
  }
  if (src !== undefined && src !== null && typeof dst === 'object' && typeof src === 'object') {
    let optionsKeys = Object.keys(src);
    for (let i = 0; i < optionsKeys.length; i++) {
      let key = optionsKeys[i];
      if (
        typeof src[key] === 'object' &&
        (dst[key] === undefined || typeof dst[key] === 'object')
      ) {
        if (dst[key] === undefined) {
          dst[key] = {};
        }
        dst[key] = assignWithDepth(dst[key], src[key], depth - 1);
      } else {
        dst[key] = src[key];
      }
    }
  }
  return dst;
};

export default {
  detectInit,
  detectDirective,
  detectType,
  isSubstringInArray,
  interpolateToCurve,
  calcLabelPosition,
  calcCardinalityPosition,
  formatUrl,
  getStylesFromArray,
  generateId,
  runFunc,
  assignWithDepth
};
