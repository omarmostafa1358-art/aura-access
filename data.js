/* ==========================================================================
   AuraAccess: Egyptian directory dataset (js/data.js)
   ---------------------------------------------------------------------------
   A classic script (not fetch-JSON) so the page also works from file://.
   Exposes window.AuraData. Rendered by js/catalog.js.

   HOW THE DATA WAS BUILT
   Every entry below was taken from a public web page that was read on
   2026-11-09. Nothing is invented: when a source did not state an address,
   a phone number, a date or a price, the field is simply absent.

   FIELDS
     id           unique, [a-z0-9-]
     title, org   Arabic display texts
     summary      what the source says, in Arabic
     cities       ["cairo" | "giza" | "alexandria"] or ["all"] when the source
                  gives no city (nationwide, online, or not stated). Entries
                  with "all" appear under every city filter.
     access       ["mobility" | "visual" | "hearing" | "cognitive"] or ["all"]
                  (the source says "persons with disabilities" in general).
     tags         short facts shown on the card
     source       { label, url }   the page the facts came from
     verification { status: "confirmed" | "partial", checked: "YYYY-MM-DD",
                    note }          "partial" = something important is unstated
                                    or the source is secondary / possibly old

   PLACES ONLY
     type         "public" | "medical"
     area         neighbourhood or landmark as the source states it
     status       "open" | "partial" | "unknown" + statusLabel (badge text)
     locationName real-world name + area + city, sent to Google Maps search
     geo          { lat, lng } landmark-level coordinates, only for well-known
                  landmarks. Approximate: used for map pins, never for routing
                  to a door. Absent when there is no reliable coordinate.

   COURSES / TOOLS
     apply        { url, label } official registration page, only if the
                  source publishes one
     facts        extra one-line facts (eligibility, size, price ...)
   ========================================================================== */
(function () {
  'use strict';

  const CHECKED = '2026-11-09';

  const data = {
    meta: Object.freeze({ version: '1.0.0', compiled: CHECKED, language: 'ar' }),

    cities: [
      { id: 'cairo', label: 'القاهرة' },
      { id: 'giza', label: 'الجيزة' },
      { id: 'alexandria', label: 'الإسكندرية' },
    ],

    // "cognitive" is an addition to the three requested categories: two verified
    // programmes (Dandelion, Village of Hope) serve exactly this group.
    access: [
      { id: 'mobility', label: 'حركية' },
      { id: 'visual', label: 'بصرية' },
      { id: 'hearing', label: 'سمعية' },
      { id: 'cognitive', label: 'ذهنية وتوحد' },
    ],

    courses: [
      {
        id: 'itida-dxc-dandelion',
        title: 'برنامج داندليون للتدريب التقني',
        org: 'هيئة تنمية صناعة تكنولوجيا المعلومات (ITIDA) و DXC',
        summary: 'تدريب لمدة 9 أشهر للمتنوعين عصبيًا (التوحد وفرط الحركة وعسر القراءة وغيرها) على تحليل البيانات واختبار البرمجيات، مع خبرة عملية ومسار للتوظيف.',
        cities: ['all'],
        access: ['cognitive'],
        tags: ['تحليل بيانات', 'اختبار برمجيات', '9 أشهر'],
        facts: ['الشروط: تشخيص موثّق وعمر 30 سنة أو أقل', 'عدد المقاعد: حتى 60 متدربًا', 'للاستفسار: 16248'],
        apply: { url: 'https://itida-dxc.clue-digital.com/', label: 'التسجيل الرسمي' },
        source: { label: 'صفحة البرنامج على موقع ITIDA', url: 'https://itida.gov.eg/English/Programs/ITIDA-DXC-Dandelion-Training-Program/' },
        verification: { status: 'confirmed', checked: CHECKED, note: 'المدينة غير محددة في المصدر.' },
      },
      {
        id: 'helm-academy',
        title: 'أكاديمية حُلم للمهارات المهنية',
        org: 'Helm Consulting (القاهرة)',
        summary: 'منصة تدريب متاحة تضم نحو 100 وحدة في المهارات المهنية والاستعداد للوظيفة والمهارات الشخصية، بالعربية والإنجليزية، وبصيغ القراءة السهلة وبرايل والصوت، مع شهادة رقمية.',
        cities: ['all'],
        access: ['all'],
        tags: ['عن بُعد', 'برايل وصوت', 'قراءة سهلة', 'شهادة رقمية'],
        facts: ['المقر الرئيسي في القاهرة والمنصة عبر الإنترنت'],
        source: { label: 'ملف المشروع لدى Zero Project', url: 'https://zeroproject.org/view/project/57808d89-4caa-ef11-b8e9-0022489c2733' },
        verification: { status: 'partial', checked: CHECKED, note: 'لم يذكر المصدر رابط تسجيل أو أسعارًا؛ راجع الجهة مباشرة.' },
      },
      {
        id: 'asdaa-it-deaf',
        title: 'تدريب الحاسب والبرمجة للصم بمواد بلغة الإشارة',
        org: 'جمعية أصداء لخدمة ضعاف السمع',
        summary: 'برنامج تعليم تقنية المعلومات للصم بمواد مترجمة إلى لغة الإشارة، وتدريب المعلمين، وربط الخريجين بوظائف تقنية.',
        cities: ['all'],
        access: ['hearing'],
        tags: ['برمجة', 'مواد بلغة الإشارة', 'تأهيل للتوظيف'],
        source: { label: 'ملف سامي جميل لدى Ashoka', url: 'https://www.ashoka.org/en/fellow/samy-gamil' },
        verification: { status: 'partial', checked: CHECKED, note: 'المصدر تعريفي وقد لا يعكس البرامج الحالية، ولم يحدد مدينة. تواصل مع الجمعية قبل التسجيل.' },
      },
      {
        id: 'moss-digital-skills',
        title: 'برامج المهارات الرقمية لذوي الإعاقة',
        org: 'وزارة التضامن الاجتماعي',
        summary: 'عشرة برامج تدريبية منذ يناير 2025 في التسويق الرقمي وريادة الأعمال والعلامة الشخصية وكتابة السيرة الذاتية وتطبيقات الذكاء الاصطناعي، بالتعاون مع شركات وبنوك ومديريات القوى العاملة.',
        cities: ['all'],
        access: ['all'],
        tags: ['تسويق رقمي', 'ريادة أعمال', 'ذكاء اصطناعي'],
        facts: ['استفاد منها 1,580 متدربًا بحسب تقرير الوزارة'],
        source: { label: 'تقرير MENA Startup Digest', url: 'https://menastartupdigest.com/?p=50794' },
        verification: { status: 'partial', checked: CHECKED, note: 'تقرير صحفي بلا مواعيد دورات قادمة أو رابط تسجيل. اسأل مديرية القوى العاملة في محافظتك.' },
      },
      {
        id: 'taheel-telecom-egypt',
        title: 'تدريب اللغة الإنجليزية ومهارات الحاسب',
        org: 'شبكة تأهيل لخدمات ذوي الإعاقة وتليكوم مصر',
        summary: 'برنامج تدريب تنفذه قطاع التدريب في المصرية للاتصالات لتقوية اللغة الإنجليزية ومهارات الحاسب الأساسية وإعداد المتدربين لسوق العمل.',
        cities: ['all'],
        access: ['all'],
        tags: ['إنجليزي', 'حاسب أساسي'],
        facts: ['المستهدف: 500 متدرب'],
        source: { label: 'تقرير MEA Tech Watch', url: 'https://meatechwatch.com/?p=12373' },
        verification: { status: 'partial', checked: CHECKED, note: 'لم يذكر المصدر المكان ولا موعد البدء.' },
      },
      {
        id: 'eitesal-giz',
        title: 'تدريب تقنية المعلومات والتوظيف خارج القاهرة',
        org: 'اتصال (EiTESAL) والوكالة الألمانية GIZ',
        summary: 'تدريب نحو 300 شخص من ذوي الإعاقة بين 21 و40 سنة على مهارات تقنية المعلومات المطلوبة في سوق العمل، في محافظات الوجه البحري والصعيد، مع فرص عمل.',
        cities: ['all'],
        access: ['all'],
        tags: ['تقنية معلومات', 'من 21 إلى 40 سنة'],
        facts: ['المحافظات غير محددة في المصدر'],
        source: { label: 'تقرير Daily News Egypt', url: 'https://www.dailynewsegypt.com/?p=799010' },
        verification: { status: 'partial', checked: CHECKED, note: 'خبر عن إطلاق البرنامج؛ تأكد من فتح باب التسجيل الحالي مع الجهة.' },
      },
    ],

    tools: [
      {
        id: 'scribeme-app',
        title: 'تطبيق ScribeMe لوصف المحيط بالصوت',
        org: 'تطبيق من تطوير مبرمج مصري كفيف (القاهرة)',
        summary: 'تطبيق يصف المحيط بالصوت ويجيب عن الأسئلة اللحظية عبر كاميرا الهاتف، يدعم 20 لغة منها العربية، ويعمل مع نظارات Meta الذكية.',
        cities: ['all'],
        access: ['visual'],
        tags: ['آيفون وأندرويد', 'يدعم العربية', 'تنزيل مجاني'],
        facts: ['الميزات الإضافية باشتراك: 20 دولارًا شهريًا أو 200 دولار سنويًا بحسب التقرير'],
        source: { label: 'تقرير نُشر عبر The Star', url: 'https://www.thestar.com.my/tech/tech-news/2026/08/18/blind-egyptian-entrepreneur039s-ai-app-helps-others-039see039-the-world' },
        verification: { status: 'partial', checked: CHECKED, note: 'الأسعار من التقرير الصحفي وقد تتغير؛ تحقق من متجر التطبيقات.' },
      },
      {
        id: 'alhassan-wheelchairs',
        title: 'كراسي متحركة مخصصة وتمويل مشروعات صغيرة',
        org: 'مؤسسة الحسن لدمج ذوي القدرات المختلفة',
        summary: 'مؤسسة تعمل في محافظات مصر الـ27 على توفير كراسي متحركة مخصصة ودراجات نارية مجهزة وفرص رياضية وتمويل مشروعات العمل الحر لمستخدمي الكراسي.',
        cities: ['all'],
        access: ['mobility'],
        tags: ['كراسي مخصصة', 'تمويل مشروعات', 'كل المحافظات'],
        source: { label: 'ملف الممارسة لدى Zero Project', url: 'https://zeroproject.org/practice/pra191287egy-factsheet/' },
        verification: { status: 'partial', checked: CHECKED, note: 'المصدر لا يذكر شروط الاستحقاق أو عنوانًا؛ تواصل عبر صفحة المؤسسة الرسمية.' },
      },
      {
        id: 'osteocare-prosthetics',
        title: 'أطراف صناعية علوية وسفلية وصيانتها',
        org: 'شركة أوستيوكير للأطراف الصناعية والأجهزة التعويضية (مدينة نصر، القاهرة)',
        summary: 'تصنيع وتركيب الأطراف الصناعية العلوية والسفلية والذكية، وصيانة دورية وقطع غيار. يذكر الدليل أيضًا أجهزة مساعدة قريبة مثل الكراسي المتحركة وأحزمة الدعم.',
        cities: ['cairo'],
        access: ['mobility'],
        tags: ['أطراف صناعية', 'صيانة وقطع غيار', 'مدينة نصر'],
        locationName: 'شركة أوستيوكير للأطراف الصناعية، 12 طريق النصر، مدينة نصر، القاهرة',
        source: { label: 'صفحة الشركة في دليل Misr Connect', url: 'https://misrconnect.com/business/1011' },
        verification: { status: 'partial', checked: CHECKED, note: 'دليل تجاري لا يضمن الجودة أو الأسعار. اتصل واسأل عن التقييم قبل الشراء.' },
      },
    ],

    places: [
      {
        id: 'bibalex-taha-hussein',
        title: 'مكتبة طه حسين للمكفوفين وضعاف البصر',
        org: 'مكتبة الإسكندرية',
        type: 'public',
        area: 'الشاطبي',
        cities: ['alexandria'],
        access: ['visual'],
        status: 'open',
        statusLabel: 'خدمات متخصصة',
        summary: 'قاعات قراءة لمستخدمي برايل و10 أجهزة حاسب بتقنيات مساعدة، وتحويل نص مطبوع إلى صوت، ومكبرات، وطباعة برايل ونسخ برايل للكتب الدراسية، ومتطوعو قراءة.',
        tags: ['كتب برايل وصوتية', 'تحويل النص إلى كلام', '10 أجهزة حاسب', 'مكبرات'],
        locationName: 'Taha Hussein Library for the Blind and Visually Impaired, Bibliotheca Alexandrina, Chatby, Alexandria, Egypt',
        geo: { lat: 31.2089, lng: 29.9092 },
        source: { label: 'صفحة المكتبة على موقع مكتبة الإسكندرية', url: 'https://bibalex.org/Libraries/Presentation/Static/14720.aspx' },
        verification: { status: 'confirmed', checked: CHECKED, note: 'الخدمات مؤكدة من الصفحة.' },
      },
      {
        id: 'egyptian-museum-tahrir',
        title: 'المتحف المصري بالتحرير',
        org: 'وزارة السياحة والآثار',
        type: 'public',
        area: 'ميدان التحرير، وسط البلد',
        cities: ['cairo'],
        access: ['visual', 'mobility'],
        status: 'partial',
        statusLabel: 'مهيأ جزئيًا',
        summary: 'مسار لمسي لضعاف البصر بقطع يمكن لمسها وعليها لافتات برايل ومعها أجهزة صوتية. الدور الأرضي في الأغلب متاح لمستخدمي الكراسي، والأدوار العليا أصعب بلا مساعدة.',
        tags: ['مسار لمسي', 'لافتات برايل', 'أجهزة صوتية', 'الدور الأرضي ميسّر'],
        locationName: 'Egyptian Museum, Tahrir Square, Cairo, Egypt',
        geo: { lat: 30.0478, lng: 31.2336 },
        source: { label: 'خبر المسار اللمسي على موقع الآثار المصرية', url: 'https://egymonuments.gov.eg/en/news/feeling-the-eternal-masterpieces-of-egypta-special-path-for-the-visually-impaired-at-the-egyptian-museum-in-cairo' },
        verification: { status: 'confirmed', checked: CHECKED, note: 'تفاصيل إتاحة الكراسي من دليل سياحي (Cairo360).' },
      },
      {
        id: 'grand-egyptian-museum',
        title: 'المتحف المصري الكبير',
        org: 'وزارة السياحة والآثار',
        type: 'public',
        area: 'قرب هضبة الأهرامات',
        cities: ['giza'],
        access: ['mobility', 'visual'],
        status: 'open',
        statusLabel: 'مهيأ بحسب المصدر',
        summary: 'مواقف ومقاعد راحة قرب المدخل، ومصاعد ومنحدرات لمستخدمي الكراسي، وبطاقات شرح بخط برايل، ومكبرات صوت اتجاهية عند المعروضات.',
        tags: ['منحدرات ومصاعد', 'بطاقات برايل', 'مواقف مخصصة', 'مقاعد راحة'],
        locationName: 'Grand Egyptian Museum, Giza, Egypt',
        geo: { lat: 29.9942, lng: 31.119 },
        source: { label: 'خبر Egypt Independent عن تيسيرات المتحف', url: 'https://egyptindependent.com/gem-announces-new-website-accommodations-for-visitors-with-disabilities/' },
        verification: { status: 'confirmed', checked: CHECKED, note: 'الإتاحة وفق وصف المتحف المعلن؛ اتصل قبل الزيارة للتأكد من الخدمات يوم زيارتك.' },
      },
      {
        id: 'giza-plateau',
        title: 'هضبة الأهرامات',
        org: 'الجيزة',
        type: 'public',
        area: 'هضبة الجيزة',
        cities: ['giza'],
        access: ['mobility'],
        status: 'partial',
        statusLabel: 'مهيأة جزئيًا',
        summary: 'المناطق المحيطة بها ممرات ممهدة ومنحدرات، أما الدخول إلى داخل الأهرامات فغير متاح لمستخدمي الكراسي. تنظّم شركات سياحة جولات بسيارات مجهزة.',
        tags: ['ممرات ممهدة', 'الداخل غير متاح', 'جولات مجهزة'],
        locationName: 'Giza Pyramids Plateau, Giza, Egypt',
        geo: { lat: 29.9792, lng: 31.1342 },
        source: { label: 'دليل Cairo360 للأماكن الميسّرة', url: 'https://www.cairo360.com/article/city-life/accessible-outings-in-cairo-wheelchair-friendly-places-for-tourists-locals-to-explore-the-capital/' },
        verification: { status: 'partial', checked: CHECKED, note: 'مصدر سياحي غير رسمي.' },
      },
      {
        id: 'al-azhar-park',
        title: 'حديقة الأزهر',
        org: 'القاهرة',
        type: 'public',
        area: 'القاهرة (الحي غير مذكور في المصدر)',
        cities: ['cairo'],
        access: ['mobility'],
        status: 'open',
        statusLabel: 'مهيأة بحسب المصدر',
        summary: 'ممرات ممهدة ومنحدرات خفيفة ودورات مياه مهيأة ومناطق مظللة.',
        tags: ['ممرات ممهدة', 'دورات مياه مهيأة', 'مظلات'],
        locationName: 'Al-Azhar Park, Cairo, Egypt',
        geo: { lat: 30.0407, lng: 31.265 },
        source: { label: 'دليل Cairo360 للأماكن الميسّرة', url: 'https://www.cairo360.com/article/city-life/accessible-outings-in-cairo-wheelchair-friendly-places-for-tourists-locals-to-explore-the-capital/' },
        verification: { status: 'partial', checked: CHECKED, note: 'مصدر سياحي غير رسمي.' },
      },
      {
        id: 'osteocare-nasr-city',
        title: 'شركة أوستيوكير للأطراف الصناعية',
        org: 'مدينة نصر',
        type: 'medical',
        area: '12 طريق النصر، مدينة نصر',
        cities: ['cairo'],
        access: ['mobility'],
        status: 'unknown',
        statusLabel: 'جهة خدمات',
        summary: 'مركز تصنيع وتركيب وصيانة الأطراف الصناعية، العنوان كما هو مدرج في الدليل التجاري.',
        tags: ['أطراف صناعية', 'صيانة', 'مدينة نصر'],
        locationName: 'شركة أوستيوكير للأطراف الصناعية، 12 طريق النصر، مدينة نصر، القاهرة',
        source: { label: 'صفحة الشركة في دليل Misr Connect', url: 'https://misrconnect.com/business/1011' },
        verification: { status: 'partial', checked: CHECKED, note: 'العنوان من دليل تجاري، وإتاحة المبنى نفسه غير مذكورة. اتصل قبل الزيارة.' },
      },
      {
        id: 'village-of-hope-alexandria',
        title: 'مركز قرية الأمل للشباب ذوي الإعاقة الذهنية',
        org: 'الإسكندرية',
        type: 'medical',
        area: 'الإسكندرية (العنوان غير مذكور في المصدر)',
        cities: ['alexandria'],
        access: ['cognitive'],
        status: 'unknown',
        statusLabel: 'جهة خدمات',
        summary: 'مؤسسة أهلية بالإسكندرية تقدم رعاية نهارية بخدمات طبية ونفسية، وتدريبًا مهنيًا للشباب، وأنشطة رياضية.',
        tags: ['رعاية نهارية', 'تدريب مهني', 'أنشطة رياضية'],
        locationName: 'Village of Hope Center for the Mentally Challenged, Alexandria, Egypt',
        source: { label: 'صفحة المركز لدى Hands Along the Nile', url: 'https://www.handsalongthenile.org/?p=961' },
        verification: { status: 'partial', checked: CHECKED, note: 'المصدر طرف ثالث ولا يذكر عنوانًا ولا هاتفًا. الخريطة قد تعرض عدة نتائج؛ تأكد من الاسم.' },
      },
      {
        id: 'nile-community-library',
        title: 'مكتبة النيل المجتمعية',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'القاهرة',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Nile Community Library, Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%85%D9%83%D8%AA%D8%A8%D8%A9%20%D8%A7%D9%84%D9%86%D9%8A%D9%84%20%D8%A7%D9%84%D9%85%D8%AC%D8%AA%D9%85%D8%B9%D9%8A%D8%A9%20%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'civil-services-hall-downtown',
        title: 'قاعة الخدمات المدنية',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'وسط البلد',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Civil Services Hall, Downtown Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%82%D8%A7%D8%B9%D8%A9%20%D8%A7%D9%84%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%20%D8%A7%D9%84%D9%85%D8%AF%D9%86%D9%8A%D8%A9%20%D9%88%D8%B3%D8%B7%20%D8%A7%D9%84%D8%A8%D9%84%D8%AF%20%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'maadi-rehabilitation-clinics',
        title: 'عيادات المعادي للتأهيل',
        org: 'جهة مضافة من فريق المشروع',
        type: 'medical',
        area: 'المعادي',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Maadi Rehabilitation Clinics, Maadi, Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D8%B9%D9%8A%D8%A7%D8%AF%D8%A7%D8%AA%20%D8%A7%D9%84%D9%85%D8%B9%D8%A7%D8%AF%D9%8A%20%D9%84%D9%84%D8%AA%D8%A3%D9%87%D9%8A%D9%84' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'heliopolis-egypt-garden',
        title: 'حديقة مصر الجديدة',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'مصر الجديدة',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Heliopolis Garden, Masr El Gedida, Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D8%AD%D8%AF%D9%8A%D9%82%D8%A9%20%D9%85%D8%B5%D8%B1%20%D8%A7%D9%84%D8%AC%D8%AF%D9%8A%D8%AF%D8%A9' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'nasr-city-learning-center',
        title: 'مركز مدينة نصر للتعلم',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'مدينة نصر',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Nasr City Learning Center, Nasr City, Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%85%D8%B1%D9%83%D8%B2%20%D9%85%D8%AF%D9%8A%D9%86%D8%A9%20%D9%86%D8%B5%D8%B1%20%D9%84%D9%84%D8%AA%D8%B9%D9%84%D9%85' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'giza-heritage-museum',
        title: 'متحف التراث بالجيزة',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'الجيزة',
        cities: ['giza'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Heritage Museum, Giza, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%85%D8%AA%D8%AD%D9%81%20%D8%A7%D9%84%D8%AA%D8%B1%D8%A7%D8%AB%20%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'maadi-youth-center',
        title: 'مركز شباب المعادي',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'المعادي',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Maadi Youth Center, Maadi, Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%85%D8%B1%D9%83%D8%B2%20%D8%B4%D8%A8%D8%A7%D8%A8%20%D8%A7%D9%84%D9%85%D8%B9%D8%A7%D8%AF%D9%8A' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'transport-help-office',
        title: 'مكتب مساعدة المواصلات',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'القاهرة',
        cities: ['cairo'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Transport Help Office, Cairo, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%85%D9%83%D8%AA%D8%A8%20%D9%85%D8%B3%D8%A7%D8%B9%D8%AF%D8%A9%20%D8%A7%D9%84%D9%85%D9%88%D8%A7%D8%B5%D9%84%D8%A7%D8%AA%20%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
      {
        id: 'giza-arts-workshop',
        title: 'ورشة فنون الجيزة',
        org: 'جهة مضافة من فريق المشروع',
        type: 'public',
        area: 'الجيزة',
        cities: ['giza'],
        access: [],
        status: 'unknown',
        statusLabel: 'بيانات الإتاحة غير مؤكدة',
        summary: 'مكان مضاف إلى الدليل من قائمة فريق المشروع. لم نراجع بعد خدماته ولا مستوى إتاحته لكل نوع من الإعاقة، فاتصل بالمكان وتأكد قبل الذهاب.',
        tags: ['بانتظار التوثيق'],
        locationName: 'Giza Arts Workshop, Giza, Egypt',
        source: { label: 'البحث عن المكان على خرائط جوجل', url: 'https://www.google.com/maps/search/?api=1&query=%D9%88%D8%B1%D8%B4%D8%A9%20%D9%81%D9%86%D9%88%D9%86%20%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9' },
        verification: { status: 'partial', checked: CHECKED, note: 'الاسم والمنطقة من قائمة فريق المشروع. الخريطة قد تعرض عدة نتائج بنفس الاسم؛ تأكد من الموقع. الخدمات والإتاحة لم تُوثَّق بعد.' },
      },
    ],
  };

  // Freeze deeply so no other script can mutate the shared dataset by accident
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };

  window.AuraData = freeze(data);
})();
