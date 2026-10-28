import 'package:flutter/widgets.dart';

/// Selects the app-language copy for UI text that has not yet moved into ARB.
/// Keep this helper limited to Persian and English, matching the app's locales.
String appText(BuildContext context, String fa, String en) {
  return Localizations.localeOf(context).languageCode == 'en' ? en : fa;
}


/// Converts common Persian service-layer exceptions into the selected app language.
/// Unknown errors are preserved rather than guessed or silently discarded.
String appError(BuildContext context, Object? error) {
  final message = (error ?? '').toString().replaceFirst('Exception: ', '').trim();
  if (Localizations.localeOf(context).languageCode != 'en') return message;
  const translations = <String, String>{
    'سرور Royal Club هنوز تنظیم نشده است. ابتدا سرویس API را راه‌اندازی کنید.':
        'The Royal Club server is not configured yet. Start the API service first.',
    'پاسخ سرور بیش از حد طول کشید. لطفاً دوباره تلاش کنید.':
        'The server response timed out. Please try again.',
    'پاسخ سرور بیش از حد طول کشید؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.':
        'The server response timed out. Check your internet connection and try again.',
    'اتصال به سرور برقرار نشد. ممکن است سرویس API خاموش باشد یا آدرس آن تغییر کرده باشد.':
        'Could not connect to the server. The API may be offline or its address may have changed.',
    'اتصال به سرور برقرار نشد؛ آدرس API و دسترسی اینترنت را بررسی کنید.':
        'Could not connect to the server. Check the API address and internet access.',
    'پاسخ سرور قابل‌خواندن نیست.':
        'The server response could not be read.',
    'پاسخ سرور قابل‌خواندن نیست. آدرس API و دسترسی Codespaces را بررسی کنید.':
        'The server response could not be read. Check the API address and Codespaces access.',
    'پاسخ سرور نامعتبر است.':
        'The server returned an invalid response.',
    'خطا در ارتباط با سرور':
        'A server communication error occurred.',
    'خطای سرور':
        'A server error occurred.',
    'ابتدا وارد حساب شوید.':
        'Please log in first.',
    'درخواست ناموفق بود.':
        'The request failed.',
    'شناسه کاربر معتبر نیست. لطفاً دوباره نام کاربری را جست‌وجو کنید.':
        'Invalid user ID. Please search for the username again.',
  };
  final exact = translations[message];
  if (exact != null) return exact;
  if (message.startsWith('خطای سرور (')) {
    return message.replaceFirst('خطای سرور', 'Server error');
  }
  if (message.startsWith('خطای سرور:')) {
    return message.replaceFirst('خطای سرور:', 'Server error:');
  }
  return message;
}
