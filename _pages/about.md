---
permalink: /
title: "主页"
author_profile: true
mirror: true
redirect_from: 
    - /about/
    - /about.html
---

我是**武嘉文**，南京大学新闻传播学院新闻传播学博士研究生。硕士在南京大学艺术学院读美术学，做美术考古方向的汉代物质文化与图像；本科毕业于南京晓庄学院广播电视编导专业，2023 年秋在德国图宾根大学（Eberhard Karls Universität Tübingen）交换一学期。

我的研究从汉代实物做到历史影像。硕士阶段的学位论文做的是四神博局镜，从铜镜纹饰入手，看汉代人怎么用图像安排方位和秩序；博士影像史学，关注中华民族历史影像。本科期间在小米、京东做过内容运营与风控方向的实习。

研究方向
======

* **影像史学**：中华民族历史影像（博士阶段）
* **美术考古**：汉代物质文化与图像（硕士阶段），学位论文做四神博局镜纹饰与汉代宇宙观
* **AI 应用与伦理研究**

教育背景
======

* **博士研究生**，南京大学新闻传播学院，新闻传播学（050300），2026.09 – 至今
    * 研究方向：影像史学 · 中华民族历史影像
* **硕士研究生**，南京大学艺术学院，美术学（130400），2021.09 – 2024.06
    * 研究方向：美术考古 · 汉代物质文化与图像
    * 学位论文：《四神博局镜纹饰及相关问题研究》
    * 修读美术史、考古学、中国古代文学等课程，排名 10%，多次获学业奖学金
* **本科 / 学士**，南京晓庄学院新闻传播学院，广播电视编导（130305），2017.09 – 2021.06
    * 修读影视后期制作、数字媒体、纪录片、广告、电影与电视剧研究等课程，排名 10%，多次获学业奖学金
* **学期交换**，德国图宾根大学，校际合作，2023.10 – 2024.03

{% assign _honours = site.data.awards | where: "key", "honours" | first %}
荣誉
======

{% if _honours %}{% for item in _honours.items %}* {{ item.text }}
{% endfor %}{% endif %}
近期成果
======

* 武嘉文. 四神博局镜与汉代宇宙观[J]. 华夏文化, 2025, (04): 27–32.
* 武嘉文. 何以信任：大模型时代新闻传播系统信任的责任化重构[J]. 融媒, 2026, (9): 4–11.
* 《四神博局纹饰的质与文》获南京大学历史学院第五届茅家琦史学论坛优秀奖（2025.11）
* 论文列表见 [论文](/publications/) 页；完整履历见 [履历](/cv/)

项目
======

  <ul>{% for post in site.portfolio %}
    {% include archive-single.html %}
  {% endfor %}</ul>

获奖
======

{% include han-awards.html %}

带等级标签的完整版见 [获奖与荣誉](/timeline/) 页。

教学
======

  <ul>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>

会议与暑期学校
======

  <ul>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</ul>

联系方式
======

* 邮箱：[wujiawen@smail.nju.edu.cn](mailto:wujiawen@smail.nju.edu.cn)
* 所在地：中国 · 南京
