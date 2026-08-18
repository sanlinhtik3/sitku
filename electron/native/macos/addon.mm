#include <node_api.h>
#include <cstring>

extern "C" bool sitku_attach_native_chrome(void *handle);
extern "C" void sitku_detach_native_chrome(void *handle);
extern "C" void sitku_set_native_appearance(void *handle, int mode);
extern "C" void sitku_perform_native_haptic(int kind);

namespace {

void *readWindowHandle(napi_env env, napi_value value) {
  bool is_buffer = false;
  if (napi_is_buffer(env, value, &is_buffer) != napi_ok || !is_buffer) return nullptr;

  void *bytes = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &bytes, &length) != napi_ok || length < sizeof(void *)) {
    return nullptr;
  }

  void *handle = nullptr;
  std::memcpy(&handle, bytes, sizeof(void *));
  return handle;
}

napi_value boolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

napi_value attach(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc != 1) return boolean(env, false);
  return boolean(env, sitku_attach_native_chrome(readWindowHandle(env, argv[0])));
}

napi_value detach(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc == 1) sitku_detach_native_chrome(readWindowHandle(env, argv[0]));
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value setAppearance(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t mode = 0;
  if (argc == 2) napi_get_value_int32(env, argv[1], &mode);
  if (argc >= 1) sitku_set_native_appearance(readWindowHandle(env, argv[0]), mode);
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value performHaptic(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t kind = 0;
  if (argc == 1) napi_get_value_int32(env, argv[0], &kind);
  sitku_perform_native_haptic(kind);
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"attach", nullptr, attach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"detach", nullptr, detach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setAppearance", nullptr, setAppearance, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"performHaptic", nullptr, performHaptic, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
