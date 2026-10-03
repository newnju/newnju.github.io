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

{% include han-research.html %}

教育背景
======

{% include han-education.html %}

荣誉
======

{% include han-honours.html %}

近期成果
======

{% include han-recent-pubs.html %}
* 论文列表见 [论文](/publications/) 页；完整履历见 [履历](/cv/)

项目
======

  <div>{% for post in site.portfolio %}
    {% include archive-single.html %}
  {% endfor %}</div>

获奖
======

{% include han-awards.html %}

带等级标签的完整版见 [获奖与荣誉](/timeline/) 页。

教学
======

  <div>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>

会议与暑期学校
======

  <div>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</div>

联系方式
======

{% include han-contact.html %}
