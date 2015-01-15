#!/usr/bin/env python

import errno
import grp
import os
import pwd
import re
import shutil
import tempfile

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__),
                                        os.path.pardir))
LOG_DIR_RE = re.compile(r"'log_directory': '[^\']+'", re.I)
LIB_DIR = '/usr/lib/kronos'
LOG_DIR = '/var/log/kronos'
RUN_DIR = '/var/run/kronos'
TMP_DIR = tempfile.gettempdir()
UWSGI_VERSION = '2.0.5.1'


def run_cmd(cmd):
  print '> %s' % cmd
  assert os.system(cmd) == 0


def safe_mkdir(path):
  print '> mkdir %s' % path
  try:
    os.makedirs(path)
  except OSError as e:
    if e.errno != errno.EEXIST:
      raise e


def create_user_and_group():
  print 'Creating kronos user and group accounts...'
  try:
    pwd.getpwnam('kronos')
  except KeyError:
    run_cmd('useradd kronos')
  try:
    grp.getgrnam('kronos')
  except KeyError:
    run_cmd('groupadd kronos')
  print 'done.'


def make_dirs():
  print 'Creating directories...'
  safe_mkdir('/etc/kronos')
  safe_mkdir(LOG_DIR)
  safe_mkdir(RUN_DIR)
  safe_mkdir(LIB_DIR)
  print 'done.'


def copy_files():
  print 'Copying configuration and init.d script files...'
  safe_mkdir('/etc/uwsgi')
  shutil.copy(os.path.join(BASE_DIR, 'scripts/uwsgi.ini'),
              '/etc/uwsgi/kronos.ini')
  kronosd_file_path = os.path.join(BASE_DIR, 'scripts/kronosd.init.d')
  shutil.copy(kronosd_file_path, '/etc/init.d/kronosd')
  with open(os.path.join(BASE_DIR, 'settings.py.template')) as f:
    settings = f.read()
  if not LOG_DIR_RE.search(settings):
    raise Exception('Failed to find log directory in settings.py.template.')
  settings = re.sub(LOG_DIR_RE, "'log_directory': '%s'" % LOG_DIR, settings)
  with open('/etc/kronos/settings.py', 'w') as f:
    f.write(settings)
  print 'done.'


def install_uwsgi():
  print 'Compiling uWSGI and copying it to the lib directory...'
  cwd = os.getcwd()
  uwsgi_dir = LIB_DIR + '/uwsgi'
  shutil.rmtree(uwsgi_dir, ignore_errors=True)
  safe_mkdir(uwsgi_dir)
  tmp_dir = '%s/uwsgi-%s' % (TMP_DIR, UWSGI_VERSION)
  os.chdir(TMP_DIR)
  run_cmd('wget https://github.com/unbit/uwsgi/archive/%s.tar.gz' %
          UWSGI_VERSION)
  run_cmd('tar xvzf %s.tar.gz' % UWSGI_VERSION)
  os.unlink('%s.tar.gz' % UWSGI_VERSION)
  os.chdir(tmp_dir)
  run_cmd('make')
  run_cmd('make plugin.transformation_chunked')
  run_cmd('make plugin.transformation_gzip')
  # Only copy the compiled binary + .so files for needed plugins.
  for name in ('uwsgi',
               'transformation_chunked_plugin.so',
               'transformation_gzip_plugin.so'):
    shutil.copy(name, '%s/%s' % (uwsgi_dir, name))
  run_cmd('chown -R kronos:kronos %s' % uwsgi_dir)
  os.chdir(cwd)
  shutil.rmtree(tmp_dir, ignore_errors=True)
  print 'done.'


def install_kronosd():
  create_user_and_group()
  make_dirs()
  install_uwsgi()
  copy_files()


if __name__ == '__main__':
  install_kronosd()
