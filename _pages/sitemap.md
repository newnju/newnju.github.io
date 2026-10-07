---
layout: archive
title: "站点地图"
permalink: /sitemap/
author_profile: true
---

{% include base_path %}

本页列出站点上的全部中文页面与条目；英文页面与条目见[英文站点地图]({{ base_path }}/en/sitemap/)。另有一份给搜索引擎的 [XML 版本]({{ base_path }}/sitemap.xml)。

<h2>页面</h2>
{%- comment -%}
  英文页（locale 含 'en'）归 /en/sitemap/ 那张图，这里只列中文页 —— 与英文图
  按 locale 反向过滤正好对称，两张图各自一种语言、互不重复。
{%- endcomment -%}
{% for post in site.pages %}
  {% unless post.url == page.url or post.sitemap == false or post.locale contains 'en' %}
    {% include archive-single.html %}
  {% endunless %}
{% endfor %}

<h2>论文</h2>
{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}

<h2>项目</h2>
{% for post in site.portfolio %}
  {% include archive-single.html %}
{% endfor %}

<h2>会议与暑期学校</h2>
{% for post in site.talks %}
  {% include archive-single-talk.html %}
{% endfor %}

<h2>教学</h2>
{% for post in site.teaching reversed %}
  {% include archive-single.html %}
{% endfor %}
