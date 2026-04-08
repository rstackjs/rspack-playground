"use strict";
(self["webpackChunklib1"] = self["webpackChunklib1"] || []).push([
  ["src_Component_js-webpack_sharing_consume_default_react_react"],
  {
    "./src/Component.js":
      /*!**************************!*\
  !*** ./src/Component.js ***!
  \**************************/
      function (__unused_webpack_module, __webpack_exports__, __webpack_require__) {
        __webpack_require__.r(__webpack_exports__);
        __webpack_require__.d(__webpack_exports__, {
          default: () => __WEBPACK_DEFAULT_EXPORT__,
        });
        /* ESM import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ =
          __webpack_require__(
            /*! react/jsx-dev-runtime */ "../../../node_modules/.pnpm/react@19.2.0/node_modules/react/jsx-dev-runtime.js",
          );
        /* ESM import */ var date_fns__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(
          /*! date-fns */ "webpack/sharing/consume/default/date-fns/date-fns",
        );
        /* ESM import */ var date_fns__WEBPACK_IMPORTED_MODULE_1___default =
          /*#__PURE__*/ __webpack_require__.n(date_fns__WEBPACK_IMPORTED_MODULE_1__);
        /* ESM import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(
          /*! react */ "webpack/sharing/consume/default/react/react?9214",
        );
        /* ESM import */ var react__WEBPACK_IMPORTED_MODULE_2___default =
          /*#__PURE__*/ __webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
        function _array_like_to_array(arr, len) {
          if (len == null || len > arr.length) len = arr.length;
          for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
          return arr2;
        }
        function _array_with_holes(arr) {
          if (Array.isArray(arr)) return arr;
        }
        function _iterable_to_array_limit(arr, i) {
          var _i =
            arr == null
              ? null
              : (typeof Symbol !== "undefined" && arr[Symbol.iterator]) || arr["@@iterator"];
          if (_i == null) return;
          var _arr = [];
          var _n = true;
          var _d = false;
          var _s, _e;
          try {
            for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) {
              _arr.push(_s.value);
              if (i && _arr.length === i) break;
            }
          } catch (err) {
            _d = true;
            _e = err;
          } finally {
            try {
              if (!_n && _i["return"] != null) _i["return"]();
            } finally {
              if (_d) throw _e;
            }
          }
          return _arr;
        }
        function _non_iterable_rest() {
          throw new TypeError(
            "Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.",
          );
        }
        function _sliced_to_array(arr, i) {
          return (
            _array_with_holes(arr) ||
            _iterable_to_array_limit(arr, i) ||
            _unsupported_iterable_to_array(arr, i) ||
            _non_iterable_rest()
          );
        }
        function _unsupported_iterable_to_array(o, minLen) {
          if (!o) return;
          if (typeof o === "string") return _array_like_to_array(o, minLen);
          var n = Object.prototype.toString.call(o).slice(8, -1);
          if (n === "Object" && o.constructor) n = o.constructor.name;
          if (n === "Map" || n === "Set") return Array.from(n);
          if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
            return _array_like_to_array(o, minLen);
        }
        var _this = undefined;

        // date-fns is a shared module, but used as usual
        // exposing modules act as async boundary,
        // so no additional async boundary need to be added here
        // As data-fns is an shared module, it will be placed in a separate file
        // It will be loaded in parallel to the code of this module
        var Component = function (param) {
          var locale = param.locale;
          var _useState = _sliced_to_array((0, react__WEBPACK_IMPORTED_MODULE_2__.useState)(0), 2),
            cnt = _useState[0],
            setCnt = _useState[1];
          (0, react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(function () {
            setInterval(function () {
              setCnt(function (x) {
                return x + 1;
              });
            }, 1000);
          }, []);
          return /*#__PURE__*/ (0, react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(
            "div",
            {
              style: {
                border: "5px solid darkblue",
              },
              children: [
                /*#__PURE__*/ (0, react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(
                  "div",
                  {
                    children: ["cnt: ", cnt],
                  },
                  void 0,
                  true,
                  {
                    fileName:
                      "/Users/bytedance/Projects/rstack-examples/rspack/module-federation-v1.5/lib1/src/Component.js",
                    lineNumber: 18,
                    columnNumber: 7,
                  },
                  _this,
                ),
                /*#__PURE__*/ (0, react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(
                  "p",
                  {
                    children: "I'm a Component exposed from container B!",
                  },
                  void 0,
                  false,
                  {
                    fileName:
                      "/Users/bytedance/Projects/rstack-examples/rspack/module-federation-v1.5/lib1/src/Component.js",
                    lineNumber: 19,
                    columnNumber: 7,
                  },
                  _this,
                ),
                /*#__PURE__*/ (0, react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(
                  "p",
                  {
                    children: [
                      "Using date-fn in Remote: ",
                      (0, date_fns__WEBPACK_IMPORTED_MODULE_1__.formatRelative)(
                        (0, date_fns__WEBPACK_IMPORTED_MODULE_1__.subDays)(new Date(), 2),
                        new Date(),
                        {
                          locale: locale,
                        },
                      ),
                    ],
                  },
                  void 0,
                  true,
                  {
                    fileName:
                      "/Users/bytedance/Projects/rstack-examples/rspack/module-federation-v1.5/lib1/src/Component.js",
                    lineNumber: 20,
                    columnNumber: 7,
                  },
                  _this,
                ),
              ],
            },
            void 0,
            true,
            {
              fileName:
                "/Users/bytedance/Projects/rstack-examples/rspack/module-federation-v1.5/lib1/src/Component.js",
              lineNumber: 17,
              columnNumber: 5,
            },
            _this,
          );
        };
        /* ESM default export */ const __WEBPACK_DEFAULT_EXPORT__ = Component;
      },
  },
]);
